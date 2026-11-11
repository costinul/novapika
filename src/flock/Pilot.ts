import { Quaternion, Vector3 } from 'three';
import { movementConfig } from '../config/movement';
import { HANDS } from '../player/Player';
import type { Player } from '../player/Player';

// A lobby parrot is an ordinary Player. It has no special way to move: this
// pilot only writes the head and hand poses a headset would, and the normal
// claw and wing rules do the rest. To climb it flaps both "hands" down
// together, to glide it holds them out, and to turn it banks them.
//
// Nothing in the wing rules slows a glide, but every flap pushes the way the
// head faces. So a landing is flown as a bird flies one: glide in, pull the
// wings in and turn to face back along the way it came, brake with a few
// fluttering flaps, hover over the perch, then fold up and drop the last bit.

const ARM = 0.6; // m, how far out to each side a spread wing reaches
const TUCK = 0.15; // m, hands this close in do not act as wings
const FLAP_DOWN = 0.2; // s, downstroke
const FLAP_UP = 0.3; // s, upstroke
const FLAP_TOP = 0.3; // m above the head, where every stroke starts
const FULL_STROKE = 0.6; // m
const SMALL_STROKE = 0.34; // m, the shortest stroke still fast enough to count as a flap
const GENTLE = 1.1; // m/s, hand speed for everything but flapping: too slow to count as a flap
const TURN_RATE = 4.5; // rad/s, how fast the parrot can change the way it faces
const GLIDE_SLOPE = 0.2; // m of height lost per m flown in a glide
const FLAP_GAIN = 1.3; // m, about how much one full flap raises the top of the climb
const SLOW_RANGE = 9; // m from the target at which the glide ends and braking begins
const HOVER_HEIGHT = 0.7; // m above the perch to hover at
const DROP_WITHIN = 0.3; // m from above the perch before folding the wings
const DROP_SPEED = 1.0; // m/s, slower than this sideways before folding the wings
const LANDED_WITHIN = 1.2; // m from the target that counts as having landed on it
const UP = new Vector3(0, 1, 0);

export type PilotMode = 'rest' | 'flap' | 'glide' | 'slow' | 'drop' | 'shake';

export class Pilot {
  mode: PilotMode = 'rest';
  /** The way the parrot faces, a horizontal unit vector. */
  readonly facing = new Vector3(0, 0, -1);
  /** True once the parrot is standing at the target of the last `flyTo`. */
  landed = false;
  /** Where the head looks, against the way the body faces: a turn, then a nod, in radians. */
  lookTurn = 0;
  lookPitch = 0;

  private phase = 0;
  private timer = 0;
  private stroke = FULL_STROKE;
  /** Hands in the parrot's own frame: x to its right, y up from its feet, z forward. */
  private readonly hand = { left: new Vector3(-0.14, 0.3, 0), right: new Vector3(0.14, 0.3, 0) };
  private readonly want = new Vector3();
  private readonly toTarget = new Vector3();
  private readonly desired = new Vector3();
  private readonly away = new Vector3();
  private readonly right = new Vector3();
  private readonly bodyTurn = new Quaternion();
  private readonly q = new Quaternion();

  /** Height of the parrot's head above its feet in its own tracking space. */
  private get headHeight(): number {
    return movementConfig.bodyHeight.value;
  }

  /** Fold the wings and stand still. */
  rest(player: Player, dt: number): void {
    this.mode = 'rest';
    this.fold(dt);
    this.write(player);
  }

  /** Forget the last flight. Call when a new target is chosen. */
  begin(): void {
    this.landed = false;
  }

  /**
   * One control step of flying to `target` and landing on it. `avoid` is a
   * point to steer round, such as the player's head.
   */
  flyTo(player: Player, target: Vector3, dt: number, avoid?: Vector3): void {
    this.timer += dt;
    const pos = player.position;
    const v = player.velocity;

    this.toTarget.copy(target).sub(pos);
    const height = -this.toTarget.y; // how far the parrot is above the target
    this.toTarget.y = 0;
    const distance = this.toTarget.length();
    const speed = Math.hypot(v.x, v.z);
    const rise = v.y > 0 ? (v.y * v.y) / (2 * movementConfig.gravity.value) : 0;

    // --- On something solid. --------------------------------------------------
    if (player.grounded) {
      if (pos.distanceTo(target) < LANDED_WITHIN) {
        this.landed = true;
        this.rest(player, dt);
        return;
      }
      // Somewhere else: get the breath back, then take off again.
      if (player.stamina < 0.95) {
        this.rest(player, dt);
        return;
      }
    }
    this.landed = false;

    // --- A claw has snagged something on the way: pull the wings in. ---------
    if (this.mode === 'shake') {
      this.fold(dt);
      if (this.timer > 0.45) this.start('glide');
      this.write(player);
      return;
    }
    if ((player.claws.left.planted || player.claws.right.planted) && !player.grounded) {
      this.start('shake');
      this.write(player);
      return;
    }

    // --- The last drop onto the perch, wings folded. --------------------------
    if (this.mode === 'drop') {
      this.fold(dt);
      this.write(player);
      // Fell past it, or drifted off: fly again.
      if (height < -0.6 || distance > 1.2 || this.timer > 1.5) this.start('slow');
      return;
    }

    // --- Close in: brake, hover over the perch, and drop. ---------------------
    if (distance < SLOW_RANGE && (this.mode === 'slow' || !player.grounded)) {
      if (this.mode !== 'slow') this.start('slow');
      if (distance < DROP_WITHIN && speed < DROP_SPEED && height > 0.05 && height < 1.3 && v.y < 1) {
        this.start('drop');
        this.fold(dt);
        this.write(player);
        return;
      }
      // The speed we would like: toward the perch, slower the nearer we are.
      const wanted = Math.min(2.6, distance * 1.1);
      if (distance > 0.02) this.desired.copy(this.toTarget).multiplyScalar(wanted / distance);
      else this.desired.set(0, 0, 0);
      this.desired.x -= v.x;
      this.desired.z -= v.z;
      const change = this.desired.length();
      // Face the way the speed must change: each flap pushes that way.
      if (change > 0.25) this.turnToward(this.desired.multiplyScalar(1 / change), dt);
      if (avoid) this.steerClear(pos, avoid, dt);

      // Bigger strokes to brake hard or to climb; small ones just to hover.
      // With the wings in the parrot falls freely, so look a moment ahead.
      const low = HOVER_HEIGHT - (height + v.y * 0.45);
      const canFlap = player.stamina > 0.05;
      const tooHigh = low < -0.5;
      this.stroke = Math.max(SMALL_STROKE, Math.min(FULL_STROKE, 0.4 + 0.35 * low + 0.1 * change));
      const midStroke = this.phase > 0 && this.phase < FLAP_DOWN + FLAP_UP;
      // Flap unless well above the perch; but braking comes first.
      if (canFlap && (midStroke || !tooHigh || change > 1.2)) this.hoverFlap(dt);
      else this.holdTucked(dt);
      this.write(player);
      return;
    }

    // --- Far out: head for the target and hold the glide path. ----------------
    if (distance > 0.05) this.desired.copy(this.toTarget).multiplyScalar(1 / distance);
    else this.desired.copy(this.facing);
    this.turnToward(this.desired, dt);
    if (avoid) this.steerClear(pos, avoid, dt);

    // The path is the glide slope down to a point above the target where
    // braking begins. Judge by where the current rise will top out.
    const slopeHeight = HOVER_HEIGHT + GLIDE_SLOPE * Math.max(0, distance - SLOW_RANGE);
    const below = slopeHeight - (height + rise);
    const canFlap = player.stamina > 0.1 || player.grounded;
    const midStroke = this.mode === 'flap' && this.phase < FLAP_DOWN;
    // Taking off needs a flap whatever the height; in the air, only when one
    // flap's worth short of the path.
    if (canFlap && (midStroke || player.grounded || below > FLAP_GAIN)) {
      if (this.mode !== 'flap') this.start('flap');
      this.flap(dt);
    } else {
      if (this.mode !== 'glide') this.start('glide');
      // Bank toward the heading we want. Positive turns left.
      let bank = 0;
      if (speed > 0.6) {
        const cross = v.z * this.desired.x - v.x * this.desired.z;
        const dot = v.x * this.desired.x + v.z * this.desired.z;
        bank = Math.max(-1, Math.min(1, Math.atan2(cross, dot) / 0.5));
      }
      // Above the path: droop the wings to sink faster.
      const droop = Math.max(0, Math.min(0.7, (-below - 0.25) * 0.35));
      this.glide(bank, droop, dt);
    }
    this.write(player);
  }

  /** Turn away from a point that must be kept clear, such as the player's face. */
  private steerClear(pos: Vector3, avoid: Vector3, dt: number): void {
    this.away.copy(pos).sub(avoid).setY(0);
    const gap = this.away.length();
    if (gap < 2.5 && gap > 0.01) this.turnToward(this.away.multiplyScalar(1 / gap), dt * 2);
  }

  private start(mode: PilotMode): void {
    this.mode = mode;
    this.timer = 0;
    this.phase = 0;
  }

  private turnToward(direction: Vector3, dt: number): void {
    const cross = this.facing.z * direction.x - this.facing.x * direction.z;
    const dot = this.facing.x * direction.x + this.facing.z * direction.z;
    const angle = Math.atan2(cross, dot);
    const step = Math.max(-TURN_RATE * dt, Math.min(TURN_RATE * dt, angle));
    this.facing.applyAxisAngle(UP, step).setY(0).normalize();
  }

  /** Move one hand toward a point in the parrot's own frame, no faster than `speed`. */
  private moveHand(h: 'left' | 'right', x: number, y: number, z: number, speed: number, dt: number): void {
    const hand = this.hand[h];
    this.want.set(x, y, z).sub(hand);
    const distance = this.want.length();
    const step = speed * dt;
    if (distance <= step) hand.set(x, y, z);
    else hand.addScaledVector(this.want, step / distance);
  }

  private both(x: number, y: number, z: number, speed: number, dt: number): void {
    this.moveHand('left', -x, y, z, speed, dt);
    this.moveHand('right', x, y, z, speed, dt);
  }

  private fold(dt: number): void {
    this.both(0.14, this.headHeight - 0.3, 0, GENTLE, dt);
  }

  /** Full flaps for climbing: arms stay out, so the upstroke glides. */
  private flap(dt: number): void {
    this.phase = (this.phase + dt) % (FLAP_DOWN + FLAP_UP);
    const top = this.headHeight + FLAP_TOP;
    const bottom = top - FULL_STROKE;
    const y =
      this.phase < FLAP_DOWN
        ? top + (bottom - top) * (this.phase / FLAP_DOWN)
        : bottom + (top - bottom) * ((this.phase - FLAP_DOWN) / FLAP_UP);
    // Fast enough to follow the stroke exactly once the arms are out.
    this.both(ARM, y, 0, 6, dt);
  }

  /**
   * Flaps for slow flight, a flutter with the wings held in. Spread wings
   * would glide, and a glide always picks up speed; held in, each flap gives
   * only its lift and its push the way the parrot faces.
   */
  private hoverFlap(dt: number): void {
    this.phase = (this.phase + dt) % (FLAP_DOWN + FLAP_UP);
    const top = this.headHeight + FLAP_TOP;
    const bottom = top - this.stroke;
    const y =
      this.phase < FLAP_DOWN
        ? top + (bottom - top) * (this.phase / FLAP_DOWN)
        : bottom + (top - bottom) * ((this.phase - FLAP_DOWN) / FLAP_UP);
    this.both(TUCK, y, 0, 6, dt);
  }

  /** Wings in at the top of the stroke: sinking, ready to flap. */
  private holdTucked(dt: number): void {
    this.phase = 0;
    this.both(TUCK, this.headHeight + FLAP_TOP, 0, GENTLE, dt);
  }

  private glide(bank: number, droop: number, dt: number): void {
    const level = this.headHeight - 0.3 - 0.25 * droop;
    this.moveHand('left', -ARM, level - 0.3 * bank, 0, GENTLE, dt);
    this.moveHand('right', ARM, level + 0.3 * bank, 0, GENTLE, dt);
  }

  /** Write the head and hands into the player's input, as a headset would. */
  private write(player: Player): void {
    const input = player.input;
    this.right.set(-this.facing.z, 0, this.facing.x);
    input.head.position.set(0, this.headHeight, 0);
    // Hands follow the body; the head may also turn and nod on top of it.
    this.bodyTurn.setFromUnitVectors(this.want.set(0, 0, -1), this.facing);
    input.head.quaternion
      .copy(this.bodyTurn)
      .multiply(this.q.setFromAxisAngle(UP, this.lookTurn))
      .multiply(this.q.setFromAxisAngle(this.want.set(1, 0, 0), this.lookPitch));
    for (const h of HANDS) {
      const hand = this.hand[h];
      const out = input.hands[h];
      out.grip.position
        .set(0, hand.y, 0)
        .addScaledVector(this.right, hand.x)
        .addScaledVector(this.facing, hand.z);
      out.grip.quaternion.copy(this.bodyTurn);
      out.aim.position.copy(out.grip.position);
      out.aim.quaternion.copy(out.grip.quaternion);
    }
  }
}
