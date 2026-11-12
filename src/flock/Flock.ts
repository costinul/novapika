import { Group, Vector3 } from 'three';
import type { Mimicry } from '../audio/Mimicry';
import type { FeatherBatch } from '../characters/FeatherBatch';
import { character } from '../characters/roster';
import type { VoiceDef } from '../characters/types';
import { flockConfig } from './config';
import type { PhysicsWorld } from '../engine/physics';
import { newMoveInput, toMoveInput } from '../movement/input';
import { placeAt, stepMovement } from '../movement/step';
import type { MoveInput } from '../movement/types';
import { HANDS, Player } from '../player/Player';
import { PlayerView } from '../player/PlayerView';
import type { ActionLayer } from '../world/actions';
import type { FlockDef } from '../world/types';
import type { WorldState } from '../world/WorldState';
import { Brain } from './Brain';
import type { FlockView } from './Brain';

/** Lobby parrots tire more slowly than a child's arms: a flap costs them this share. */
const FLAP_COST = 0.4;
const HEAR_RANGE = 30; // m, how far a call carries to another parrot
const MIMIC_RANGE = 6; // m, how close the player must be for a parrot to listen
const LISTEN_FOR = 8; // s a parrot waits for the player to say something
const LOST_BELOW_Y = -5; // m, a parrot below this has left the lobby

interface Member {
  brain: Brain;
  player: Player;
  view: PlayerView | null;
  move: MoveInput;
  /** Position at the previous simulation step, for smooth drawing. */
  previous: Vector3;
  drawnAt: Vector3;
  /** Seconds until this parrot answers a call it heard, or 0. */
  answerIn: number;
  /** Mimicry: seconds until it next listens, and how long it has been listening. */
  listenIn: number;
  listening: number;
  /** While another game runs the flock: this parrot was perked up at the last frame. */
  wasExcited: boolean;
}

/** Small repeatable random number generator, one per parrot. */
function randomFrom(text: string): () => number {
  let s = 2166136261;
  for (let i = 0; i < text.length; i++) s = Math.imul(s ^ text.charCodeAt(i), 16777619);
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The lobby's own parrots. Each is an ordinary Player whose input comes from
 * a behaviour script instead of a headset; the same movement rules, toy
 * actions and drawing apply to it as to a person.
 */
export class Flock implements FlockView {
  /** Add this to the scene: the parrots' models. */
  readonly object = new Group();
  spots: Vector3[] = [];
  private members: Member[] = [];
  private food = new Set<string>();
  private simulated = true;

  constructor(
    private readonly world: WorldState,
    private readonly actions: ActionLayer,
    private readonly physics: PhysicsWorld,
    /** Left out when there is nothing to draw with, as in tests. */
    private readonly feathers: FeatherBatch | null,
    private readonly sound: { call(voice: VoiceDef, loudness: number): void } | null,
    private readonly mimicry: Mimicry | null,
  ) {}

  get players(): Player[] {
    return this.members.map((m) => m.player);
  }

  get brains(): Brain[] {
    return this.members.map((m) => m.brain);
  }

  /** Bring a lobby's flock to life. Call after the world has loaded the lobby. */
  load(def: FlockDef | undefined): void {
    if (!def) return;
    this.spots = def.spots.map((p) => new Vector3(...p));
    this.food.clear();
    for (const target of this.world.targets.values()) {
      if (target.def.kind === 'feeder') for (const type of target.def.accepts ?? []) this.food.add(type);
    }

    for (const parrot of def.parrots) {
      const player = new Player(parrot.id, parrot.characterId);
      player.human = false;
      player.flapCost = FLAP_COST;
      const brain = new Brain(parrot, player, this, this.world, this.actions, this.physics, randomFrom(parrot.id));
      const view = this.feathers ? new PlayerView(player, this.feathers, false) : null;
      if (view) this.object.add(view.object);
      const member: Member = {
        brain,
        player,
        view,
        move: newMoveInput(),
        previous: new Vector3(),
        drawnAt: new Vector3(),
        answerIn: 0,
        listenIn: 10 + this.members.length * 7,
        listening: 0,
        wasExcited: false,
      };
      player.simulatedHere = this.simulated;
      this.members.push(member);
      this.world.players.set(player.id, player);
      this.putAt(member, this.spots[parrot.home]);
    }
  }

  /** Remove the flock. Call before the world forgets the lobby. */
  clear(): void {
    for (const { player, view } of this.members) {
      this.world.players.delete(player.id);
      if (view) this.object.remove(view.object);
    }
    this.members = [];
    this.spots = [];
    this.mimicry?.stopListening();
  }

  /**
   * Whether this game runs the flock. In a lobby with other players only one
   * game does, the host's; the rest are sent where each parrot is and only
   * show it. A game that starts running a flock it was only showing carries
   * each parrot on from where it is.
   */
  setSimulated(on: boolean): void {
    if (on === this.simulated) return;
    this.simulated = on;
    this.mimicry?.stopListening();
    for (const member of this.members) {
      const { player, brain } = member;
      player.simulatedHere = on;
      member.listening = 0;
      member.wasExcited = false;
      if (!on) continue;
      // The movement rules remember where the hands were: start that afresh from here.
      brain.pilot.facing.set(0, 0, -1).applyQuaternion(player.input.head.quaternion).setY(0);
      if (brain.pilot.facing.lengthSq() < 0.01) brain.pilot.facing.set(0, 0, -1);
      brain.pilot.facing.normalize();
      toMoveInput(player.input, member.move);
      player.wings.tracked = false;
      for (const h of HANDS) {
        player.claws[h].planted = false;
        player.claws[h].last.copy(player.position).add(member.move.hands[h].position);
        player.wings.sweepStart[h] = -1;
      }
      member.previous.copy(player.position);
      brain.takeOver();
    }
  }

  /** One fixed simulation step for every parrot. */
  step(dt: number): void {
    if (!this.simulated) return;
    for (const member of this.members) {
      const { brain, player } = member;
      brain.update(dt);
      if (brain.rescue || player.position.y < LOST_BELOW_Y) {
        this.putAt(member, this.spots[brain.def.home]);
        brain.rescued();
        continue;
      }
      member.previous.copy(player.position);
      // A parrot settled on its perch is left alone until it next moves.
      if (brain.settled) continue;
      toMoveInput(player.input, member.move);
      stepMovement(player, member.move, this.physics, flockConfig, dt);
    }
  }

  /**
   * Once per drawn frame. `alpha` is how far (0..1) the frame is between the
   * last two simulation steps.
   */
  frame(dt: number, alpha: number): void {
    if (!this.simulated) {
      // Already moved to where the game that runs them says they are.
      for (const member of this.members) {
        member.view?.update(dt);
        // A parrot that perks up has just called.
        const excited = member.player.excitement > 0.5;
        if (excited && !member.wasExcited) {
          this.sound?.call(character(member.player.characterId).voice, this.loudnessOf(member));
        }
        member.wasExcited = excited;
      }
      return;
    }
    const human = this.listener();
    for (const member of this.members) {
      const { player, brain } = member;
      member.drawnAt.lerpVectors(member.previous, player.position, alpha);
      player.updateWorldPoses(member.drawnAt);
      player.excitement = Math.max(0, player.excitement - dt / 1.5);
      member.view?.update(dt);

      if (member.answerIn > 0) {
        member.answerIn -= dt;
        if (member.answerIn <= 0 && brain.state === 'perched') this.voice(member);
      }
      if (brain.def.mimics && human) this.mimic(member, human, dt);
    }
  }

  // --- FlockView: what each brain may ask ---------------------------------------

  spotTaken(index: number): boolean {
    return this.members.some((m) => m.brain.spot === index);
  }

  foodSeekers(): number {
    return this.members.filter((m) => m.brain.isSeekingFood).length;
  }

  human(near: Vector3): Player | null {
    let nearest: Player | null = null;
    let least = Infinity;
    for (const player of this.world.players.values()) {
      if (!player.human) continue;
      const distance = player.head.position.distanceToSquared(near);
      if (distance < least) {
        nearest = player;
        least = distance;
      }
    }
    return nearest;
  }

  /** The player this game is played by: the one who hears the flock, and whom a mimic hears. */
  private listener(): Player | null {
    for (const player of this.world.players.values()) if (player.human && player.simulatedHere) return player;
    return null;
  }

  isFood(toyType: string): boolean {
    return this.food.has(toyType);
  }

  /** One parrot calls; another that hears it may answer a moment later. */
  call(from: Brain): void {
    const caller = this.members.find((m) => m.brain === from);
    if (!caller) return;
    this.voice(caller);
    const listeners = this.members.filter(
      (m) =>
        m !== caller &&
        m.answerIn <= 0 &&
        m.brain.state === 'perched' &&
        m.player.position.distanceTo(caller.player.position) < HEAR_RANGE,
    );
    if (listeners.length === 0) return;
    const answerer = listeners[Math.floor(Math.random() * listeners.length)];
    answerer.answerIn = 0.5 + Math.random() * 0.8;
  }

  // -----------------------------------------------------------------------------

  private voice(member: Member): void {
    member.player.excitement = 0.8;
    this.sound?.call(character(member.player.characterId).voice, this.loudnessOf(member));
  }

  /** Quieter the further the parrot is from the player. */
  private loudnessOf(member: Member): number {
    const human = this.listener();
    if (!human) return 0;
    const distance = human.head.position.distanceTo(member.player.position);
    return Math.max(0.06, 1 / (1 + distance / 5));
  }

  /** A mimic sitting near the player listens now and then, and repeats what it hears. */
  private mimic(member: Member, human: Player, dt: number): void {
    const mimicry = this.mimicry;
    if (!mimicry?.available) return;
    const near =
      member.brain.state === 'perched' &&
      member.player.position.distanceTo(human.head.position) < MIMIC_RANGE;

    if (member.listening > 0) {
      member.listening += dt;
      if (mimicry.phrase) {
        const seconds = mimicry.repeat(this.loudnessOf(member));
        member.brain.talking = seconds;
        member.player.excitement = 1;
        member.listening = 0;
        member.listenIn = 15 + Math.random() * 20;
      } else if (!near || member.listening > LISTEN_FOR) {
        mimicry.stopListening();
        member.listening = 0;
        member.listenIn = 8 + Math.random() * 8;
      }
      return;
    }
    member.listenIn -= dt;
    // Only one parrot listens at a time.
    if (near && member.listenIn <= 0 && !this.members.some((m) => m.listening > 0)) {
      mimicry.listen();
      member.listening = dt;
    }
  }

  private putAt(member: Member, spot: Vector3): void {
    const { brain, player } = member;
    brain.pilot.rest(player, 0);
    toMoveInput(player.input, member.move);
    placeAt(player, member.move, flockConfig, spot);
    member.previous.copy(player.position);
    member.drawnAt.copy(player.position);
    player.updateWorldPoses();
  }
}
