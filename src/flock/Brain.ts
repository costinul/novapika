import { Vector3 } from 'three';
import type { PhysicsWorld } from '../engine/physics';
import type { Player } from '../player/Player';
import type { ActionLayer } from '../world/actions';
import { beakPosition } from '../world/beak';
import type { FlockParrotDef } from '../world/types';
import type { WorldState } from '../world/WorldState';
import { Pilot } from './Pilot';

// What a lobby parrot decides to do. Plain states and timers, no cleverness:
// it sits on a perch for a while (looking about, preening, calling, hopping),
// then flies somewhere for one of a few reasons. The Pilot does the flying.

/** Why a parrot is in the air. */
export type Errand =
  | 'wander' // to another perch
  | 'hop' // a short flutter where it stands
  | 'food' // to the player, who is holding a seed
  | 'deliverFood' // to the feeder, with a seed it took
  | 'fetchToy' // to a loose toy
  | 'carryToy' // somewhere else, with the toy
  | 'follow' // to a spot near the player
  | 'lead'; // the helper parrot only: to a place it is showing a player

const GIVE_UP_AFTER = 40; // s in the air before picking somewhere easier
const RESCUE_AFTER = 75; // s in the air before being put back on its home perch
const FOOD_RANGE = 22; // m, how far away a held seed is noticed
const TAKE_RANGE = 2.2; // m, how close a parrot must be to take a seed from a beak
const BESIDE_PLAYER = 1.4; // m to the player's side where a visiting parrot lands
const BEHIND_PLAYER = 0.5; // m behind them, for a lobby parrot: out of the way
const AHEAD_OF_PLAYER = 1.6; // m in front of them, for the helper parrot: where it is seen, and can be spoken to
const KEEP_FROM_FACE = 1.5; // m, no chosen spot is nearer the player's head than this
const LOOSE_TOY_MAX_HEIGHT = 0.6; // m, toys this near the ground are easy to fetch
const FOLLOW_COOLDOWN = 60; // s after following before following again
const ATTEND_WITHIN = 4.5; // m, the helper parrot turns to a player this close
const ATTEND_TURN = 1.6; // rad/s, how fast its body turns to face them
const TASK_FOR = 90; // s the helper parrot keeps at following or leading before it goes back to its stump
const KEEP_UP_BEYOND = 5; // m, a player it follows who is further off than this is flown after
const THERE_WITHIN = 1.6; // m from a place that counts as being at it
const VISIT_EVERY = 90; // s at least between the helper parrot's visits to a player, with up to as long again on top
const VISIT_FOR = 50; // s a visit lasts, the flight there included

/** What the helper parrot has been asked to do: keep near a player, or go to a place and wait there. */
export type HelperTask = { follow: Player } | { lead: Vector3 };

/** What the flock tells each brain about the rest of the lobby. */
export interface FlockView {
  /** Perching places. */
  readonly spots: readonly Vector3[];
  /** Index of the spot each parrot has claimed, or -1. */
  spotTaken(index: number): boolean;
  /** How many parrots are after the player's food right now. */
  foodSeekers(): number;
  /** The human nearest to `near`, if there is one: the one to pay attention to. */
  human(near: Vector3): Player | null;
  /** Every human in the lobby. */
  humans(): Player[];
  /** Toy types that count as food. */
  isFood(toyType: string): boolean;
  /** A parrot calls out. */
  call(from: Brain): void;
}

export class Brain {
  readonly pilot = new Pilot();
  state: 'perched' | 'flying' = 'perched';
  errand: Errand = 'wander';
  /** Index of the perching spot this parrot is on or heading for, or -1. */
  spot: number;
  /** The parrot has been perched long enough to be left unsimulated. */
  settled = false;
  /** Set by the flock while this parrot repeats what it heard. */
  talking = 0;

  private timer = 0;
  private perchFor: number;
  private airTime = 0;
  private readonly target = new Vector3();
  private toyId: string | null = null;
  private activity: 'idle' | 'preen' | 'look' = 'idle';
  private activityTimer = 0;
  private lookTurn = 0;
  private callIn: number;
  private followAgainIn = 0;
  private takeIn = 0;
  private side: 1 | -1;
  private readonly v = new Vector3();
  private readonly beak = new Vector3();
  /** What the helper parrot has been asked to do, and for how much longer. Null: stay on its stump. */
  private task: HelperTask | null = null;
  private taskLeft = 0;
  /** With nothing asked of it, the helper parrot visits a player now and then: seconds until the next visit, and left of this one. */
  private visitIn = VISIT_EVERY;
  private visiting = 0;
  /** The player it is visiting. */
  private visited: Player | null = null;

  constructor(
    readonly def: FlockParrotDef,
    readonly player: Player,
    private readonly flock: FlockView,
    private readonly world: WorldState,
    private readonly actions: ActionLayer,
    private readonly physics: PhysicsWorld,
    private readonly random: () => number,
  ) {
    this.spot = def.home;
    this.perchFor = 2 + random() * 8;
    this.callIn = 4 + random() * 14;
    this.side = random() < 0.5 ? 1 : -1;
  }

  get isSeekingFood(): boolean {
    return this.state === 'flying' && this.errand === 'food';
  }

  /** One step of deciding and steering. Writes this parrot's input. */
  update(dt: number): void {
    this.timer += dt;
    this.followAgainIn = Math.max(0, this.followAgainIn - dt);
    this.talking = Math.max(0, this.talking - dt);
    if (this.task) {
      this.taskLeft -= dt;
      // Long enough, or the player it followed has gone: back to its stump.
      const gone = 'follow' in this.task && this.world.players.get(this.task.follow.id) !== this.task.follow;
      if (this.taskLeft <= 0 || gone) this.setTask(null);
    } else if (this.def.helper) this.visits(dt);
    if (this.state === 'perched') this.perch(dt);
    else this.fly(dt);
  }

  /** Ask the helper parrot to keep near a player, or to go to a place; null sends it back to its stump. */
  setTask(task: HelperTask | null): void {
    this.task = task;
    this.taskLeft = TASK_FOR;
    this.endVisit();
    // In the air: turn for the new place at once. On a perch, the next step sees to it.
    if (this.state === 'flying') this.leave(this.helperErrand() ?? 'wander');
  }

  /** Where the helper parrot should be flying to, or null if it is where it should be. */
  private helperErrand(): Errand | null {
    const here = this.player.position;
    const task = this.task;
    if (task && 'follow' in task) return task.follow.head.position.distanceTo(here) > KEEP_UP_BEYOND ? 'follow' : null;
    if (task) return task.lead.distanceTo(here) > THERE_WITHIN ? 'lead' : null;
    const visited = this.visitedNow();
    if (visited) return visited.head.position.distanceTo(here) > KEEP_UP_BEYOND ? 'follow' : null;
    return this.v.fromArray(this.def.helper!).distanceTo(here) > THERE_WITHIN ? 'wander' : null;
  }

  /**
   * With nothing asked of it, the helper parrot now and then flies over to a
   * player for a little while: any player, so that in time it comes to all.
   */
  private visits(dt: number): void {
    if (this.visiting > 0) {
      this.visiting -= dt;
      if (this.visiting <= 0) this.endVisit();
      return;
    }
    this.visitIn -= dt;
    if (this.visitIn > 0) return;
    this.visitIn = VISIT_EVERY * (1 + this.random());
    // Only to somebody who is not beside it already.
    const away = this.flock.humans().filter((human) => human.head.position.distanceTo(this.player.position) > KEEP_UP_BEYOND);
    if (away.length === 0) return;
    this.visited = away[Math.floor(this.random() * away.length)];
    this.visiting = VISIT_FOR;
  }

  private endVisit(): void {
    this.visiting = 0;
    this.visited = null;
  }

  /** The player the helper parrot is visiting now, if they are still in the lobby. */
  private visitedNow(): Player | null {
    const visited = this.visiting > 0 ? this.visited : null;
    return visited && this.world.players.get(visited.id) === visited ? visited : null;
  }

  /** The player a parrot keeps near: the one the helper was asked to follow or is visiting, or else whoever is nearest. */
  private companion(): Player | null {
    if (this.task && 'follow' in this.task) return this.task.follow;
    return this.visitedNow() ?? this.flock.human(this.player.position);
  }

  // --- On a perch ------------------------------------------------------------

  private perch(dt: number): void {
    const pilot = this.pilot;
    this.settled = this.timer > 1.2 && this.player.grounded;
    if (this.def.helper) {
      const errand = this.timer > 0.8 ? this.helperErrand() : null;
      return errand ? this.leave(errand) : this.attend(dt);
    }

    // Small things to do while sitting.
    this.activityTimer -= dt;
    if (this.activityTimer <= 0) {
      const roll = this.random();
      this.activity = roll < 0.3 ? 'preen' : roll < 0.7 ? 'look' : 'idle';
      this.activityTimer = 1.2 + this.random() * 2.5;
      this.lookTurn = (this.random() - 0.5) * 2.4;
    }
    if (this.talking > 0) {
      // Bob while repeating what it heard.
      pilot.lookTurn = 0;
      pilot.lookPitch = 0.25 * Math.sin(this.timer * 14);
    } else if (this.activity === 'preen') {
      // Head round and down to the wing, nibbling.
      pilot.lookTurn = 1.5 * this.side;
      pilot.lookPitch = -0.7 + 0.12 * Math.sin(this.timer * 11);
    } else if (this.activity === 'look') {
      pilot.lookTurn += (this.lookTurn - pilot.lookTurn) * Math.min(1, dt * 4);
      pilot.lookPitch += (0 - pilot.lookPitch) * Math.min(1, dt * 4);
    } else {
      pilot.lookTurn *= 1 - Math.min(1, dt * 3);
      pilot.lookPitch *= 1 - Math.min(1, dt * 3);
    }
    pilot.rest(this.player, dt);

    this.callIn -= dt;
    if (this.callIn <= 0) {
      this.callIn = 9 + this.random() * 16;
      this.flock.call(this);
    }

    const human = this.flock.human(this.player.position);
    this.followTime = Math.max(0, this.followTime - dt);
    // Sitting close to a player with a seed: it may be taken from here.
    if (human && this.wantsFoodStill(human) && !this.player.carriedItemId && this.tryTake(human, dt)) return;
    // A seed in the player's beak is worth leaving a perch for at once.
    if (this.timer > 1.5 && this.wantsFood() && !this.nearEnoughToTake(human)) {
      this.leave('food');
      return;
    }
    // While following the player, move on sooner.
    if (this.timer < (this.followTime > 0 ? Math.min(this.perchFor, 3) : this.perchFor)) return;

    const roll = this.random();
    if (this.player.carriedItemId) this.leave('carryToy');
    else if (this.followTime > 0 && human) this.leave('follow');
    else if (this.def.follows && human && this.followAgainIn === 0 && roll < 0.45) {
      this.followTime = 18 + this.random() * 16;
      this.leave('follow');
    } else if (roll < 0.14 && this.pickLooseToy()) this.leave('fetchToy');
    else if (roll < 0.3 && this.player.position.y < 0.5) this.leave('hop');
    else this.leave('wander');
  }

  /**
   * The helper parrot where it should be: it bobs while it talks, and
   * otherwise looks at the nearest player, so a child can see it is listening.
   */
  private attend(dt: number): void {
    const pilot = this.pilot;
    const human = this.flock.human(this.player.position);
    let turn = 0;
    let pitch = 0;
    if (this.talking > 0) {
      pitch = 0.25 * Math.sin(this.timer * 14);
    } else if (human) {
      const to = this.v.copy(human.head.position).sub(this.player.head.position);
      const flat = Math.hypot(to.x, to.z);
      if (to.length() < ATTEND_WITHIN && flat > 0.05) {
        const { facing } = pilot;
        // Positive turns left, as the pilot counts it.
        turn = Math.atan2(facing.z * to.x - facing.x * to.z, facing.x * to.x + facing.z * to.z);
        // The body shuffles round to face them; the head gets there first.
        if (Math.abs(turn) > 0.3) {
          const step = Math.sign(turn) * Math.min(Math.abs(turn), ATTEND_TURN * dt);
          const [cos, sin] = [Math.cos(step), Math.sin(step)];
          facing.set(facing.x * cos + facing.z * sin, 0, facing.z * cos - facing.x * sin).normalize();
          turn -= step;
        }
        turn = Math.max(-1.3, Math.min(1.3, turn));
        pitch = Math.max(-0.6, Math.min(0.6, Math.atan2(to.y, flat)));
      }
    }
    const ease = Math.min(1, dt * 5);
    pilot.lookTurn += (turn - pilot.lookTurn) * ease;
    pilot.lookPitch = this.talking > 0 ? pitch : pilot.lookPitch + (pitch - pilot.lookPitch) * ease;
    pilot.rest(this.player, dt);
  }

  /** Seconds of following left. */
  private followTime = 0;

  private wantsFood(): boolean {
    const human = this.flock.human(this.player.position);
    if (!human?.carriedItemId || this.player.carriedItemId) return false;
    const toy = this.world.toys.get(human.carriedItemId);
    if (!toy || !this.flock.isFood(toy.type)) return false;
    if (human.head.position.distanceTo(this.player.position) > FOOD_RANGE) return false;
    return this.flock.foodSeekers() < 2;
  }

  private pickLooseToy(): boolean {
    let best: string | null = null;
    let bestDistance = 30;
    for (const toy of this.world.toys.values()) {
      if (toy.holderId !== null || toy.placedIn !== null) continue;
      if (toy.position.y > LOOSE_TOY_MAX_HEIGHT || this.flock.isFood(toy.type)) continue;
      const d = toy.position.distanceTo(this.player.position);
      if (d < bestDistance && d > 2) {
        best = toy.id;
        bestDistance = d;
      }
    }
    this.toyId = best;
    return best !== null;
  }

  /** Take off on an errand. */
  private leave(errand: Errand): void {
    this.errand = errand;
    this.state = 'flying';
    this.settled = false;
    this.timer = 0;
    this.airTime = 0;
    this.spot = -1;
    this.pilot.lookTurn = 0;
    this.pilot.lookPitch = 0;
    this.pilot.begin();
    if (!this.chooseTarget()) {
      this.errand = 'wander';
      this.chooseTarget();
    }
  }

  // --- In the air -------------------------------------------------------------

  /** Set `target` for the current errand. False if the errand cannot be done. */
  private chooseTarget(): boolean {
    const human = this.flock.human(this.player.position);
    switch (this.errand) {
      case 'hop': {
        const angle = this.random() * Math.PI * 2;
        this.target.copy(this.player.position);
        this.target.x += Math.cos(angle) * 1.2;
        this.target.z += Math.sin(angle) * 1.2;
        const ground = this.physics.groundBelow(this.v.copy(this.target).setY(this.target.y + 1), 3);
        if (ground === null) return false;
        this.target.y = ground;
        return true;
      }
      case 'food':
        return !!human && this.besidePlayer(human);
      case 'follow': {
        const who = this.companion();
        return !!who && this.besidePlayer(who);
      }
      case 'lead':
        if (!this.task || !('lead' in this.task)) return false;
        this.target.copy(this.task.lead);
        return true;
      case 'deliverFood': {
        for (const target of this.world.targets.values()) {
          if (target.def.kind !== 'feeder') continue;
          this.target.copy(target.position).setY(target.position.y + 0.04);
          return true;
        }
        return this.randomSpot();
      }
      case 'fetchToy': {
        const toy = this.toyId ? this.world.toys.get(this.toyId) : undefined;
        if (!toy || toy.holderId !== null) return false;
        this.target.copy(toy.position).setY(Math.max(0, toy.position.y - toy.def.size / 2));
        return true;
      }
      case 'carryToy': {
        const carried = this.player.carriedItemId ? this.world.toys.get(this.player.carriedItemId) : undefined;
        if (carried && this.random() < 0.45) {
          for (const target of this.world.targets.values()) {
            const takes = !target.def.accepts || target.def.accepts.includes(carried.type);
            if (target.def.kind !== 'toyBox' || !takes) continue;
            this.target.copy(target.position).setY(target.position.y + 0.04);
            return true;
          }
        }
        return this.randomSpot();
      }
      case 'wander':
        return this.randomSpot();
    }
  }

  /** Claim a free perching spot that is not in the player's face. The helper parrot only ever goes back to its own. */
  private randomSpot(): boolean {
    if (this.def.helper) {
      this.target.fromArray(this.def.helper);
      return true;
    }
    const human = this.flock.human(this.player.position);
    for (let attempt = 0; attempt < 12; attempt++) {
      const index = Math.floor(this.random() * this.flock.spots.length);
      const spot = this.flock.spots[index];
      if (this.flock.spotTaken(index)) continue;
      if (spot.distanceTo(this.player.position) < 3) continue;
      if (human && spot.distanceTo(human.head.position) < KEEP_FROM_FACE) continue;
      this.spot = index;
      this.target.copy(spot);
      return true;
    }
    return false;
  }

  /**
   * A place to land near the player: on the ground to one side and a little
   * behind, never in front of the face. The helper parrot lands to one side
   * and well ahead instead, where the player sees it and can speak to it.
   * Failing that, the nearest perch.
   */
  private besidePlayer(human: Player): boolean {
    const head = human.head;
    this.v.set(0, 0, -1).applyQuaternion(head.quaternion).setY(0);
    if (this.v.lengthSq() < 0.01) this.v.set(0, 0, -1);
    this.v.normalize();
    // To the side (right is forward turned a quarter), and a little back or well ahead.
    this.target
      .set(-this.v.z, 0, this.v.x)
      .multiplyScalar(BESIDE_PLAYER * this.side)
      .addScaledVector(this.v, this.def.helper ? AHEAD_OF_PLAYER : -BEHIND_PLAYER)
      .add(head.position);
    const ground = this.physics.groundBelow(this.target, 2.5);
    if (ground !== null) {
      this.target.y = ground;
      return true;
    }
    // The player is high up with nothing beside them: use a perch close by.
    let best = -1;
    let bestDistance = 9;
    this.flock.spots.forEach((spot, index) => {
      const d = spot.distanceTo(head.position);
      if (d < bestDistance && d > KEEP_FROM_FACE && !this.flock.spotTaken(index)) {
        best = index;
        bestDistance = d;
      }
    });
    if (best < 0) return false;
    this.spot = best;
    this.target.copy(this.flock.spots[best]);
    return true;
  }

  private fly(dt: number): void {
    const human = this.flock.human(this.player.position);
    this.airTime += dt;
    this.followTime = Math.max(0, this.followTime - dt);

    // The player moves: keep the landing place beside them up to date.
    if ((this.errand === 'food' || this.errand === 'follow') && human && this.timer > 1 && this.spot < 0) {
      this.timer = 0;
      if (this.errand === 'food' && !this.wantsFoodStill(human)) {
        this.errand = 'wander';
        this.randomSpot();
      } else {
        this.besidePlayer(this.errand === 'follow' ? (this.companion() ?? human) : human);
      }
    }
    // Someone else got the toy first.
    if (this.errand === 'fetchToy') {
      const toy = this.toyId ? this.world.toys.get(this.toyId) : undefined;
      if (!toy || toy.holderId !== null) {
        this.errand = 'wander';
        this.randomSpot();
      }
    }

    // Taking a seed needs only to be close, not to have landed.
    if (this.errand === 'food' && human && this.tryTake(human, dt)) return;

    this.pilot.flyTo(this.player, this.target, dt, human?.head.position);

    if (this.pilot.landed) {
      this.arrive();
      return;
    }
    // Trouble: pick somewhere easy, and in the end be put back at home.
    if (this.airTime > RESCUE_AFTER) {
      this.rescue = true;
    } else if (this.airTime > GIVE_UP_AFTER && this.errand !== 'wander') {
      this.errand = 'wander';
      this.randomSpot();
      // The helper parrot could not get where it was asked to: it gives up on that.
      this.task = null;
      this.endVisit();
    }
  }

  /** Asks the flock to put this parrot back on its home perch. */
  rescue = false;

  private wantsFoodStill(human: Player): boolean {
    const toy = human.carriedItemId ? this.world.toys.get(human.carriedItemId) : undefined;
    return !!toy && this.flock.isFood(toy.type);
  }

  private nearEnoughToTake(human: Player | null): boolean {
    const toy = human?.carriedItemId ? this.world.toys.get(human.carriedItemId) : undefined;
    return !!toy && beakPosition(this.player.head, this.beak).distanceTo(toy.position) < TAKE_RANGE;
  }

  /** Close enough to the seed in the player's beak: after a moment, snatch it. */
  private tryTake(human: Player, dt: number): boolean {
    const toy = human.carriedItemId ? this.world.toys.get(human.carriedItemId) : undefined;
    if (!toy) return false;
    beakPosition(this.player.head, this.beak);
    if (this.beak.distanceTo(toy.position) > TAKE_RANGE) {
      this.takeIn = 0.8 + this.random() * 1.5;
      return false;
    }
    this.takeIn -= dt;
    if (this.takeIn > 0) return false;
    if (this.actions.dispatch({ type: 'take', playerId: this.player.id, toyId: toy.id })) {
      this.leave('deliverFood');
      return true;
    }
    return false;
  }

  private arrive(): void {
    switch (this.errand) {
      case 'fetchToy':
        if (this.toyId && this.actions.dispatch({ type: 'pickUp', playerId: this.player.id, toyId: this.toyId })) {
          this.toyId = null;
          this.sit(0.8 + this.random());
          return;
        }
        break;
      case 'carryToy':
      case 'deliverFood':
        this.actions.dispatch({ type: 'drop', playerId: this.player.id });
        break;
      case 'follow':
        if (this.followTime <= 0) this.followAgainIn = FOLLOW_COOLDOWN;
        break;
      default:
        break;
    }
    this.sit(this.errand === 'hop' ? 1 + this.random() * 3 : 4 + this.random() * 10);
  }

  private sit(seconds: number): void {
    this.state = 'perched';
    this.timer = 0;
    this.perchFor = seconds;
    this.side = this.random() < 0.5 ? 1 : -1;
  }

  /** Another game ran this parrot until now: carry on from where it is, by flying to a perch. */
  takeOver(): void {
    this.rescue = false;
    this.leave('wander');
  }

  /** Called after the flock has put the parrot back on its home perch. */
  rescued(): void {
    this.rescue = false;
    this.spot = this.def.home;
    this.sit(3 + this.random() * 5);
  }
}
