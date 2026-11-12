import { Vector3 } from 'three';
import type { FeatherBatch } from '../characters/FeatherBatch';
import type { CharacterDef } from '../characters/types';
import type { PhysicsWorld } from '../engine/physics';
import { flockConfig } from '../flock/config';
import { Pilot } from '../flock/Pilot';
import { newMoveInput, toMoveInput } from '../movement/input';
import { placeAt, stepMovement } from '../movement/step';
import { Player } from '../player/Player';
import { PlayerView } from '../player/PlayerView';

// A pet that is out of the pet corner: following its owner about, or flying
// home to its perch. Like a lobby parrot it is an ordinary Player flown by a
// Pilot under the usual wing rules. It is flown at the size of any parrot and
// only drawn small (see PlayerView), so it flies as well as they do.

/** A pet tires as slowly as a lobby parrot does. */
const FLAP_COST = 0.4;
const STAY_WITHIN = 2.8; // m from its owner before a resting pet flies to them again
const BESIDE = 1.4; // m to the owner's side where it lands
const AHEAD = 0.4; // m forward of the owner, so they can see it without turning round
const KEEP_FROM_FACE = 1.2; // m, no landing place is nearer the owner's head than this
const NEAR_PERCH = 9; // m, how far from the owner a perch may be and still do
const CATCH_UP_AFTER = 25; // s chasing its owner before it is put down beside them
const HOME_AFTER = 15; // s flying home before it is counted as there
const LOST_BELOW_Y = -5; // m, a pet below this has left the lobby
const FEEL_EVERY = 0.2; // s between looks ahead for something in the way
const FEEL_AHEAD = 3; // m, how far ahead it looks
const FEEL_RADIUS = 0.2; // m, the width of what it feels ahead with
const FEEL_HEIGHT = 0.45; // m above its feet, clear of the ground it stands on
/** Turns to try, in radians, when the straight way is blocked: a bend first, then a sharp turn. */
const WAYS_ROUND = [0.9, 1.65];
const UP = new Vector3(0, 1, 0);

export class LivePet {
  /** The pet in the world, moved by the same rules as every parrot. */
  readonly player: Player;
  /** Null when there is nothing to draw with, as in tests. */
  readonly view: PlayerView | null;
  mode: 'follow' | 'home' = 'follow';
  /** A pet sent home has got there, or has taken too long and counts as there. */
  atHome = false;
  /** Set for one step when a following pet lands by its owner. */
  arrived = false;
  flying = false;

  private readonly pilot = new Pilot();
  private readonly move = newMoveInput();
  private readonly target = new Vector3();
  /** Position at the previous simulation step, for smooth drawing. */
  private readonly previous = new Vector3();
  private readonly drawnAt = new Vector3();
  private readonly v = new Vector3();
  private readonly forward = new Vector3();
  private readonly aim = new Vector3();
  private readonly way = new Vector3();
  private readonly feeler = new Vector3();
  private timer = 0;
  private airTime = 0;
  private feelIn = 0;
  /** How far the pet is turning aside to get round something, in radians; 0 when the way is clear. */
  private detour = 0;
  private detourSide: 1 | -1 = 1;
  /** Not yet put beside its owner, for a pet that starts out already following. */
  private joining: boolean;

  /**
   * `perch` is the pet's place in the pet corner, where it goes home to.
   * `spots` are the lobby's perching places, for when its owner is somewhere
   * it cannot land beside. A pet that has just been `chosen` starts on its
   * perch, under its owner's hand; one that was following already starts
   * beside its owner.
   */
  constructor(
    readonly petId: string,
    readonly def: CharacterDef,
    private readonly perch: Vector3,
    private readonly physics: PhysicsWorld,
    feathers: FeatherBatch | null,
    private readonly spots: () => readonly Vector3[],
    chosen = true,
  ) {
    this.joining = !chosen;
    this.player = new Player(`pet-${petId}`, def.id);
    this.player.human = false;
    this.player.flapCost = FLAP_COST;
    this.view = feathers ? new PlayerView(this.player, feathers, false, def) : null;
    this.putAt(perch);
  }

  /** One fixed simulation step. `owner` is the player it follows. */
  step(dt: number, owner: Player | null): void {
    const { player, pilot } = this;
    this.timer += dt;
    this.arrived = false;
    if (this.joining && owner) {
      this.joining = false;
      if (this.landingPlace(owner)) this.putAt(this.target);
    }
    if (player.position.y < LOST_BELOW_Y) this.putAt(this.landingPlace(owner) ? this.target : this.perch);

    if (!this.flying) {
      this.watch(owner, dt);
      pilot.rest(player, dt);
      const leave =
        this.mode === 'home'
          ? !this.atHome
          : !!owner && this.timer > 0.8 && this.feetOf(owner).distanceTo(player.position) > STAY_WITHIN;
      if (leave && this.landingPlace(owner)) {
        this.flying = true;
        this.timer = 0;
        this.airTime = 0;
        pilot.lookTurn = pilot.lookPitch = 0;
        pilot.begin();
      }
    } else {
      this.airTime += dt;
      // The owner moves: keep the landing place beside them up to date.
      if (this.mode === 'follow' && this.timer > 1) {
        this.timer = 0;
        this.landingPlace(owner);
      }
      pilot.flyTo(player, this.wayTo(dt), dt, this.mode === 'follow' ? owner?.head.position : undefined);
      if (pilot.landed) {
        this.flying = false;
        this.timer = 0;
        if (this.mode === 'home') this.atHome = true;
        else this.arrived = true;
      } else if (this.mode === 'home' && this.airTime > HOME_AFTER) {
        this.atHome = true;
      } else if (this.mode === 'follow' && this.airTime > CATCH_UP_AFTER) {
        // Too far behind: be put down where it was heading.
        this.putAt(this.target);
        this.flying = false;
        this.timer = 0;
      }
    }

    this.previous.copy(player.position);
    // A pet settled on the ground is left alone until it next moves.
    if (!this.flying && player.grounded && this.timer > 1.2) return;
    toMoveInput(player.input, this.move);
    stepMovement(player, this.move, this.physics, flockConfig, dt);
  }

  /** Once per drawn frame. `alpha` is how far (0..1) the frame is between the last two steps. */
  frame(dt: number, alpha: number): void {
    this.drawnAt.lerpVectors(this.previous, this.player.position, alpha);
    this.player.updateWorldPoses(this.drawnAt);
    this.view?.update(dt);
  }

  /** Where the pet is drawn: the point its feet stand on. */
  get position(): Vector3 {
    return this.player.position;
  }

  private feetOf(owner: Player): Vector3 {
    return this.v.copy(owner.head.position).setY(owner.head.position.y - flockConfig.bodyHeight.value);
  }

  /** While resting, turn the head to look at the owner. */
  private watch(owner: Player | null, dt: number): void {
    const { pilot, player } = this;
    let turn = 0;
    if (owner && this.mode === 'follow') {
      const dx = owner.head.position.x - player.position.x;
      const dz = owner.head.position.z - player.position.z;
      const cross = pilot.facing.z * dx - pilot.facing.x * dz;
      const dot = pilot.facing.x * dx + pilot.facing.z * dz;
      turn = Math.max(-1.6, Math.min(1.6, Math.atan2(cross, dot)));
    }
    pilot.lookTurn += (turn - pilot.lookTurn) * Math.min(1, dt * 4);
    pilot.lookPitch *= 1 - Math.min(1, dt * 3);
  }

  /**
   * Set `target` to where the pet should land: its perch when going home,
   * otherwise beside its owner. False if there is nowhere to go.
   */
  private landingPlace(owner: Player | null): boolean {
    if (this.mode === 'home') {
      this.target.copy(this.perch);
      return true;
    }
    if (!owner) return false;
    const head = owner.head.position;
    this.forward.set(0, 0, -1).applyQuaternion(owner.head.quaternion).setY(0);
    if (this.forward.lengthSq() < 0.01) this.forward.set(0, 0, -1);
    this.forward.normalize();
    // Right is forward turned a quarter. Land on the side the pet is already
    // on, or on the other if there is nothing to stand on there.
    const rightX = -this.forward.z;
    const rightZ = this.forward.x;
    const near = (this.player.position.x - head.x) * rightX + (this.player.position.z - head.z) * rightZ < 0 ? -1 : 1;
    for (const side of [near, -near]) {
      this.target
        .set(rightX, 0, rightZ)
        .multiplyScalar(BESIDE * side)
        .addScaledVector(this.forward, AHEAD)
        .add(head);
      const ground = this.physics.groundBelow(this.target, 2.5);
      if (ground !== null) {
        this.target.y = ground;
        return true;
      }
    }
    // The owner is high up with nothing beside them: a perch close by will do.
    let best: Vector3 | null = null;
    let bestDistance = NEAR_PERCH;
    for (const spot of this.spots()) {
      const d = spot.distanceTo(head);
      if (d < bestDistance && d > KEEP_FROM_FACE) {
        best = spot;
        bestDistance = d;
      }
    }
    if (best) {
      this.target.copy(best);
      return true;
    }
    // Nothing near: wait on the ground below them.
    const below = this.physics.groundBelow(this.target, 100);
    if (below === null) return false;
    this.target.y = below;
    return true;
  }

  /**
   * The point to fly at just now: the landing place, or, when something
   * solid is in the way, a point off to one side to get round it.
   */
  private wayTo(dt: number): Vector3 {
    const position = this.player.position;
    this.way.copy(this.target).sub(position).setY(0);
    const distance = this.way.length();
    this.feelIn -= dt;
    if (this.feelIn <= 0) {
      this.feelIn = FEEL_EVERY;
      this.detour = 0;
      // Close in there is nothing to go round: the pilot is landing.
      if (distance > 1.5) {
        this.way.multiplyScalar(1 / distance);
        if (this.blocked(this.way, Math.min(FEEL_AHEAD, distance - 0.6))) {
          // Keep to the side it last went round, so it does not dither.
          this.detour = WAYS_ROUND[WAYS_ROUND.length - 1] * this.detourSide;
          const sides: (1 | -1)[] = this.detourSide === 1 ? [1, -1] : [-1, 1];
          search: for (const turn of WAYS_ROUND) {
            for (const side of sides) {
              if (this.blocked(this.feeler.copy(this.way).applyAxisAngle(UP, turn * side), FEEL_AHEAD)) continue;
              this.detour = turn * side;
              this.detourSide = side;
              break search;
            }
          }
        }
      }
    }
    if (this.detour === 0 || distance < 0.01) return this.target;
    this.way.copy(this.target).sub(position).setY(0).normalize().applyAxisAngle(UP, this.detour);
    // At the height of the landing place, so the pilot holds the same height on the way round.
    return this.aim.copy(position).addScaledVector(this.way, FEEL_AHEAD).setY(this.target.y);
  }

  /** Whether something solid is within `reach` of the pet, the way `direction` points. */
  private blocked(direction: Vector3, reach: number): boolean {
    const from = this.v.copy(this.player.position);
    from.y += FEEL_HEIGHT;
    return this.physics.castSphere(from, direction, reach, FEEL_RADIUS) !== null;
  }

  private putAt(spot: Vector3): void {
    const { player } = this;
    this.pilot.rest(player, 0);
    toMoveInput(player.input, this.move);
    placeAt(player, this.move, flockConfig, spot);
    this.previous.copy(player.position);
    this.drawnAt.copy(player.position);
    player.updateWorldPoses();
  }
}
