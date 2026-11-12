import { Quaternion, Vector3 } from 'three';
import type { ToyPlace } from '../../shared/actions';
import type { SharedWorld } from '../../shared/net';
import { roster } from '../characters/roster';
import { movementConfig } from '../config/movement';
import type { BodyRef, PhysicsWorld } from '../engine/physics';
import { HANDS } from '../player/Player';
import type { Player } from '../player/Player';
import type { Action, ActionLayer } from './actions';
import { BEAK_RADIUS, beakPosition, carryPosition } from './beak';
import { toyCollider } from './types';
import type {
  CharacterPerchDef,
  LobbyContent,
  PeckableDef,
  RingDef,
  TargetDef,
  ToyTypeDef,
  WaterDef,
} from './types';

const TRAY_WALL = 0.03; // m, thickness of a tray's walls and floor
const SHELF_BOARD = 0.04; // m, thickness of a shelf
const REST_SPEED = 0.3; // m/s, a toy slower than this is coming to rest
const REST_TIME = 0.25; // s at rest inside a target before it counts as placed
const JINGLE_KNOCK = 1; // m/s, speed change in one step that makes a toy jingle
const LOST_BELOW_Y = -5; // m, a toy below this has left the lobby
const STRAY_DISTANCE = 0.5; // m from its start before a toy counts as moved
const RETURN_AFTER = 180; // s a moved, unplaced toy lies untouched before going home
const RING_PASS = 0.9; // share of a ring's radius the head must pass within
const WATER_DEPTH = 0.08; // m above the surface at which a hand or body splashes
const PERCH_TOUCH = 0.26; // m from the middle of a perch's parrot that counts as touching it
const PERCH_MODEL_HEIGHT = 0.5; // m, about how tall the parrot on a perch is
const DANGLE_DROP = 0.1; // m a dangling toy hangs below the carry point
const DANGLE_STIFFNESS = 90; // 1/s2
const DANGLE_DAMPING = 5; // 1/s
const KNOCK_RANGE = 1; // m between two toys' edges within which one may have knocked the other
const KNOCKED_BY = 0.02; // m a toy lying still must be moved before it counts as knocked
const ADRIFT_FOR = 1; // s a toy may move here with no game answering for it before it is put back
const FOLLOW_RATE = 20; // 1/s, how fast a toy another game moves closes on where that game says it is

export interface Toy {
  readonly id: string;
  readonly type: string;
  readonly def: ToyTypeDef;
  readonly home: Vector3;
  readonly body: BodyRef;
  readonly position: Vector3;
  readonly quaternion: Quaternion;
  /** Id of the player carrying it, or null. */
  holderId: string | null;
  /** Id of the last player to carry it, or null. */
  lastHolderId: string | null;
  /** Id of the target place it rests in, or null. */
  placedIn: string | null;
  restTime: number;
  /** Seconds it has lain away from home, unplaced and untouched. */
  strayTime: number;
  /** Physics velocity when loose; swing velocity while carried and dangling. */
  readonly lastVelocity: Vector3;
  /**
   * With other players about, who moves the toy while it is loose: this game
   * (`here`), another game that tells this one where it is (`there`), or
   * nobody, because it lies still (`rest`).
   */
  sim: 'rest' | 'here' | 'there';
  /** Where the game that moves it last said it is. */
  readonly goalPosition: Vector3;
  readonly goalQuaternion: Quaternion;
  /** Where it last came to rest. */
  readonly restPosition: Vector3;
  readonly restQuaternion: Quaternion;
  /** Seconds it has been moving here with no game answering for it. */
  adrift: number;
}

export interface Target {
  readonly def: TargetDef;
  readonly position: Vector3;
  /** Half extents of the space a resting toy must be in, around `zoneCenter`. */
  readonly zoneCenter: Vector3;
  readonly zoneHalf: Vector3;
}

export interface Peckable {
  readonly def: PeckableDef;
  readonly position: Vector3;
  /** Players and parts currently touching it, so one touch rings once. */
  readonly touching: Set<string>;
}

export interface Ring {
  readonly def: RingDef;
  readonly position: Vector3;
  /** Unit vector through the ring. */
  readonly normal: Vector3;
  /** Flown through since the course was last finished. */
  passed: boolean;
}

export interface CharacterPerch {
  readonly def: CharacterPerchDef;
  /** Middle of the parrot standing on it. */
  readonly center: Vector3;
}

export interface Water {
  readonly def: WaterDef;
  readonly position: Vector3;
  readonly touching: Set<string>;
}

const ZERO = new Vector3();

/**
 * The shared state of a lobby's toys and interactive objects. It changes only
 * through actions (see ActionLayer). No rendering and no sound in here.
 *
 * Playing alone, this game moves every toy. With other players about, each
 * loose toy is moved by one game: the one whose parrot let go of it, until
 * it comes to rest. The others are told where it is. A toy lying still that
 * a moving toy knocks is taken over by the game moving that one; failing
 * that, by the host's.
 */
export class WorldState {
  readonly toys = new Map<string, Toy>();
  readonly targets = new Map<string, Target>();
  readonly peckables = new Map<string, Peckable>();
  readonly rings = new Map<string, Ring>();
  readonly water = new Map<string, Water>();
  readonly perches = new Map<string, CharacterPerch>();
  readonly players = new Map<string, Player>();
  /** Bells rung since every bell was last rung. */
  readonly bellsRung = new Set<string>();
  /** Called when a jingling toy is knocked; strength is 0..1. */
  onJingle: ((toy: Toy, strength: number) => void) | null = null;
  /** The id of this game's own player while playing with others; null when playing alone. */
  sharedAs: string | null = null;
  /** This game answers for toys that nobody is moving: true alone, and for the host. */
  authority = true;

  /** The toys in the lobby's own order, which is the same in every game. */
  private toyList: Toy[] = [];
  private readonly lastHead = new Map<string, Vector3>();
  private readonly v = new Vector3();
  private readonly beak = new Vector3();
  private readonly point = new Vector3();

  constructor(private readonly physics: PhysicsWorld) {}

  /** Create a lobby's toys and interactive objects. */
  load(content: LobbyContent): void {
    for (const def of content.targets) {
      const [x, y, z] = def.position;
      const [w, h, d] = def.size;
      const yaw = def.yaw ?? 0;
      // Place a box given in the target's own frame into the world.
      const add = (lx: number, ly: number, lz: number, hx: number, hy: number, hz: number): void => {
        const wx = x + lx * Math.cos(yaw) + lz * Math.sin(yaw);
        const wz = z - lx * Math.sin(yaw) + lz * Math.cos(yaw);
        this.physics.addStaticBox([wx, y + ly, wz], [hx, hy, hz], yaw);
      };

      if (def.kind === 'shelf') {
        add(0, SHELF_BOARD / 2, 0, w / 2, SHELF_BOARD / 2, d / 2);
      } else {
        const t = TRAY_WALL / 2;
        add(0, t, 0, w / 2, t, d / 2);
        add(-w / 2 + t, h / 2, 0, t, h / 2, d / 2);
        add(w / 2 - t, h / 2, 0, t, h / 2, d / 2);
        add(0, h / 2, -d / 2 + t, w / 2, h / 2, t);
        add(0, h / 2, d / 2 - t, w / 2, h / 2, t);
      }
      this.targets.set(def.id, {
        def,
        position: new Vector3(x, y, z),
        zoneCenter: new Vector3(0, h / 2, 0),
        zoneHalf: new Vector3(w / 2, h / 2, d / 2),
      });
    }

    for (const def of content.peckables) {
      this.peckables.set(def.id, { def, position: new Vector3(...def.position), touching: new Set() });
    }
    for (const def of content.rings) {
      this.rings.set(def.id, {
        def,
        position: new Vector3(...def.position),
        normal: new Vector3(Math.sin(def.yaw), 0, Math.cos(def.yaw)),
        passed: false,
      });
    }
    for (const def of content.water) {
      this.water.set(def.id, { def, position: new Vector3(...def.position), touching: new Set() });
    }

    for (const def of content.characterPerches ?? []) {
      const [x, y, z] = def.position;
      this.perches.set(def.id, { def, center: new Vector3(x, y + PERCH_MODEL_HEIGHT / 2, z) });
    }

    for (const { id, type, position } of content.toys) {
      const def = content.toyTypes[type];
      if (!def) throw new Error(`Toy "${id}" has unknown type "${type}"`);
      const { kind, half } = toyCollider(def);
      this.toys.set(id, {
        id,
        type,
        def,
        home: new Vector3(...position),
        body: this.physics.addToyBody(kind, half, position, def.density, def.bounce, def.floatiness),
        position: new Vector3(...position),
        quaternion: new Quaternion(),
        holderId: null,
        lastHolderId: null,
        placedIn: null,
        restTime: 0,
        strayTime: 0,
        lastVelocity: new Vector3(),
        sim: 'rest',
        goalPosition: new Vector3(...position),
        goalQuaternion: new Quaternion(),
        restPosition: new Vector3(...position),
        restQuaternion: new Quaternion(),
        adrift: 0,
      });
    }
    this.toyList = [...this.toys.values()];
  }

  /** Forget the lobby's contents. The physics world is cleared separately. */
  clear(): void {
    this.toys.clear();
    this.toyList = [];
    this.targets.clear();
    this.peckables.clear();
    this.rings.clear();
    this.water.clear();
    this.perches.clear();
    this.bellsRung.clear();
    this.lastHead.clear();
    for (const player of this.players.values()) player.carriedItemId = null;
  }

  /** Would this action, made by this game, be valid right now? */
  allows(action: Action): boolean {
    switch (action.type) {
      case 'pickUp': {
        const player = this.players.get(action.playerId);
        const toy = this.toys.get(action.toyId);
        return !!player && !!toy && player.carriedItemId === null && toy.holderId === null;
      }
      case 'drop':
        return !!this.players.get(action.playerId)?.carriedItemId;
      case 'take': {
        const taker = this.players.get(action.playerId);
        const toy = this.toys.get(action.toyId);
        return (
          !!taker && !!toy && taker.carriedItemId === null && toy.holderId !== null && toy.holderId !== taker.id
        );
      }
      case 'place': {
        const toy = this.toys.get(action.toyId);
        const target = this.targets.get(action.targetId);
        return !!toy && !!target && toy.holderId === null && accepts(target, toy);
      }
      case 'eat':
      case 'home':
        return this.loose(action.toyId);
      case 'rest':
        return this.loose(action.toyId) && this.toys.get(action.toyId)!.sim === 'here';
      case 'claim':
        return this.loose(action.toyId) && this.toys.get(action.toyId)!.sim === 'rest';
      case 'ring':
        return this.peckables.has(action.objectId);
      case 'passRing':
        return this.rings.has(action.ringId);
      case 'splash':
        return this.water.has(action.waterId);
      case 'celebrate':
        return true;
      case 'chooseCharacter': {
        const player = this.players.get(action.playerId);
        return !!player && player.characterId !== action.characterId && action.characterId in roster;
      }
      case 'stunt':
        return this.players.has(action.playerId);
    }
  }

  /**
   * Make way for something another player's game made happen, so that it can
   * be applied whatever this game had in mind. False if it is about things
   * this lobby does not have, or is overtaken by a toy one of this game's own
   * parrots has just picked up (the lobby settles that one).
   */
  makeWay(action: Action): boolean {
    switch (action.type) {
      case 'pickUp':
      case 'take': {
        const toy = this.toys.get(action.toyId);
        if (!toy) return false;
        // The parrot cannot be carrying anything else.
        const other = this.carriedBy(action.playerId);
        if (other && other !== toy) this.sendHome(other);
        return true;
      }
      case 'drop':
        return this.carriedBy(action.playerId) !== null;
      case 'place':
        return this.loose(action.toyId) && this.targets.has(action.targetId);
      case 'rest':
      case 'claim':
        return this.loose(action.toyId);
      case 'eat':
      case 'home': {
        const toy = this.toys.get(action.toyId);
        return !!toy && !this.players.get(toy.holderId ?? '')?.simulatedHere;
      }
      case 'ring':
        return this.peckables.has(action.objectId);
      case 'passRing':
        return this.rings.has(action.ringId);
      case 'splash':
        return this.water.has(action.waterId);
      case 'celebrate':
        return true;
      case 'chooseCharacter':
        return this.players.has(action.playerId) && action.characterId in roster;
      case 'stunt':
        return this.players.has(action.playerId);
    }
  }

  /** Apply an action. Only ActionLayer calls this. */
  apply(action: Action): void {
    switch (action.type) {
      case 'pickUp':
      case 'take': {
        const toy = this.toys.get(action.toyId)!;
        // Whoever had it, has it no longer. (A parrot another game runs may not be in view yet.)
        const loser = toy.holderId === null ? undefined : this.players.get(toy.holderId);
        if (loser) loser.carriedItemId = null;
        const player = this.players.get(action.playerId);
        if (player) player.carriedItemId = toy.id;
        toy.holderId = action.playerId;
        toy.lastHolderId = action.playerId;
        toy.placedIn = null;
        toy.restTime = 0;
        toy.strayTime = 0;
        toy.adrift = 0;
        toy.sim = 'rest';
        toy.lastVelocity.set(0, 0, 0);
        this.physics.holdBody(toy.body);
        break;
      }
      case 'drop': {
        const toy = this.carriedBy(action.playerId)!;
        const player = this.players.get(action.playerId);
        if (player) {
          carryPosition(player.head, toy.position);
          player.carriedItemId = null;
        }
        const velocity = player?.velocity ?? ZERO;
        toy.holderId = null;
        toy.strayTime = 0;
        toy.adrift = 0;
        // Whoever's parrot let go of it moves it until it comes to rest.
        if (this.sharedAs === null || player?.simulatedHere) {
          toy.sim = 'here';
          this.physics.releaseBody(toy.body, toy.position, toy.quaternion, velocity);
          toy.lastVelocity.copy(velocity);
        } else {
          this.follow(toy);
        }
        break;
      }
      case 'place':
        this.toys.get(action.toyId)!.placedIn = action.targetId;
        break;
      case 'eat':
      case 'home':
        this.sendHome(this.toys.get(action.toyId)!);
        break;
      case 'rest': {
        const toy = this.toys.get(action.toyId)!;
        const [x, y, z, qx, qy, qz, qw] = action.at;
        toy.restPosition.set(x, y, z);
        toy.restQuaternion.set(qx, qy, qz, qw);
        // The game that was moving it has it there already.
        if (toy.sim !== 'here') this.layToRest(toy);
        toy.sim = 'rest';
        toy.adrift = 0;
        break;
      }
      case 'claim': {
        const toy = this.toys.get(action.toyId)!;
        toy.adrift = 0;
        if (this.players.get(action.playerId)?.simulatedHere) toy.sim = 'here';
        else this.follow(toy);
        break;
      }
      case 'ring':
        this.bellsRung.add(action.objectId);
        break;
      case 'passRing':
        this.rings.get(action.ringId)!.passed = true;
        break;
      case 'celebrate':
        if (action.what === 'bells') this.bellsRung.clear();
        else for (const ring of this.rings.values()) ring.passed = false;
        break;
      case 'chooseCharacter':
        this.players.get(action.playerId)!.characterId = action.characterId;
        break;
      case 'stunt':
        this.players.get(action.playerId)!.excitement = 1;
        break;
      case 'splash':
        break; // Only heard and seen.
    }
  }

  /** One fixed simulation step, after physics has stepped. */
  step(dt: number, actions: ActionLayer): void {
    const shared = this.sharedAs !== null;
    for (const toy of this.toys.values()) {
      if (toy.holderId !== null) continue;
      if (shared && toy.sim === 'there') {
        // Another game moves it: close on where that game says it is.
        const k = 1 - Math.exp(-dt * FOLLOW_RATE);
        toy.position.lerp(toy.goalPosition, k);
        toy.quaternion.slerp(toy.goalQuaternion, k);
        continue;
      }
      if (this.physics.isAsleep(toy.body)) {
        toy.adrift = 0;
        if (shared && toy.sim === 'here') {
          // It has come to rest: tell the others where.
          actions.dispatch({ type: 'rest', toyId: toy.id, at: placeOf(toy) });
          continue;
        }
        // Nothing moves a sleeping toy, so only its stray clock runs.
        if (toy.placedIn === null && this.authority) this.tickStray(toy, dt, actions);
        continue;
      }
      this.physics.readBody(toy.body, toy.position, toy.quaternion);

      if (shared && toy.sim === 'rest') {
        // Stirring where it lies is nothing: only a toy that has really been moved was knocked.
        if (toy.position.distanceTo(toy.restPosition) < KNOCKED_BY) continue;
        // If it was knocked by a toy this game is moving, or nobody else
        // answers for it, this game moves it too.
        if (this.authority || this.knockedByMine(toy)) {
          actions.dispatch({ type: 'claim', toyId: toy.id, playerId: this.sharedAs! });
        } else {
          // Another game will say where it goes; if none does, it never moved.
          toy.adrift += dt;
          if (toy.adrift > ADRIFT_FOR) this.layToRest(toy);
          continue;
        }
      }

      if (toy.position.y < LOST_BELOW_Y) {
        this.goHome(toy, actions);
        continue;
      }

      const velocity = this.physics.bodyVelocity(toy.body, this.v);
      if (toy.def.jingles && this.onJingle) {
        const knock = velocity.distanceTo(toy.lastVelocity);
        if (knock > JINGLE_KNOCK) this.onJingle(toy, Math.min(1, knock / 6));
      }
      toy.lastVelocity.copy(velocity);

      if (toy.placedIn !== null) continue;
      const target = velocity.length() < REST_SPEED ? this.targetAt(toy) : null;
      toy.restTime = target ? toy.restTime + dt : 0;
      if (target && toy.restTime >= REST_TIME) {
        actions.dispatch({ type: 'place', toyId: toy.id, targetId: target.def.id });
      } else {
        this.tickStray(toy, dt, actions);
      }
    }
  }

  /**
   * Once per drawn frame, with fresh head and hand poses: carried toys follow
   * their holder, and players ring bells, fly rings and splash in water.
   */
  updateInteractions(actions: ActionLayer, dt: number): void {
    for (const player of this.players.values()) {
      const toy = player.carriedItemId ? this.toys.get(player.carriedItemId) : undefined;
      if (toy) this.carry(toy, player, dt);
      // What a parrot run elsewhere touches is for its own game to say.
      if (!player.simulatedHere) continue;

      beakPosition(player.head, this.beak);
      for (const peckable of this.peckables.values()) {
        let rang = this.touch(peckable, player, 'beak', this.beak, actions);
        for (const h of HANDS) {
          rang = this.touch(peckable, player, h, player.hands[h].grip.position, actions) || rang;
        }
        if (rang && this.bellsRung.size === this.peckables.size) {
          actions.dispatch({ type: 'celebrate', what: 'bells' });
        }
      }

      // The ring course and choosing a character are for people, not lobby parrots.
      if (!player.human) {
        this.splash(player, actions);
        continue;
      }
      // Touching the parrot on a perch, with beak or hand, makes you that parrot.
      for (const perch of this.perches.values()) {
        const touching =
          this.beak.distanceTo(perch.center) < PERCH_TOUCH ||
          HANDS.some((h) => player.hands[h].grip.position.distanceTo(perch.center) < PERCH_TOUCH);
        if (touching) {
          actions.dispatch({ type: 'chooseCharacter', playerId: player.id, characterId: perch.def.characterId });
        }
      }

      this.flyRings(player, actions);
      this.splash(player, actions);
    }
  }

  /** The closest toy a beak at `point` could bite, if any is within reach. */
  nearestBiteable(point: Vector3, reach: number): Toy | null {
    let best: Toy | null = null;
    let bestDistance = reach;
    for (const toy of this.toys.values()) {
      if (toy.holderId !== null) continue;
      const distance = toy.position.distanceTo(point) - toy.def.size / 2;
      if (distance < bestDistance) {
        best = toy;
        bestDistance = distance;
      }
    }
    return best;
  }

  // --- Playing with others ---------------------------------------------------

  /**
   * Start playing with others as the player `as`: take the lobby's toys,
   * bells and rings as the lobby server says they stand.
   */
  share(as: string, state: SharedWorld): void {
    this.sharedAs = as;
    for (const player of this.players.values()) player.carriedItemId = null;
    for (const toy of this.toys.values()) {
      toy.holderId = null;
      toy.lastHolderId = null;
      this.sendHome(toy);
    }
    this.bellsRung.clear();
    for (const ring of this.rings.values()) ring.passed = false;

    for (const [toyId, at] of state.rest) {
      if (this.toys.has(toyId)) this.apply({ type: 'rest', toyId, at });
    }
    for (const [toyId, targetId] of state.placed) {
      const toy = this.toys.get(toyId);
      if (toy && this.targets.has(targetId)) toy.placedIn = targetId;
    }
    for (const [toyId, playerId] of state.holders) {
      if (this.toys.has(toyId)) this.apply({ type: 'pickUp', toyId, playerId });
    }
    for (const [toyId] of state.sims) {
      const toy = this.toys.get(toyId);
      if (toy && toy.holderId === null) this.follow(toy);
    }
    for (const id of state.bells) if (this.peckables.has(id)) this.bellsRung.add(id);
    for (const id of state.rings) {
      const ring = this.rings.get(id);
      if (ring) ring.passed = true;
    }
  }

  /** Go back to playing alone: this game moves every toy again. */
  unshare(): void {
    if (this.sharedAs === null) return;
    this.sharedAs = null;
    this.authority = true;
    for (const toy of this.toys.values()) {
      if (toy.holderId !== null || toy.sim !== 'there') continue;
      toy.sim = 'here';
      this.physics.releaseBody(toy.body, toy.position, toy.quaternion, ZERO);
    }
  }

  /** A parrot another game runs has come into view. It may already be carrying something. */
  join(player: Player): void {
    this.players.set(player.id, player);
    player.carriedItemId = this.carriedBy(player.id)?.id ?? null;
  }

  /** A parrot another game ran has gone. Anything it carried goes back to where it started. */
  part(id: string): void {
    this.players.delete(id);
    this.lastHead.delete(id);
    const toy = this.carriedBy(id);
    if (toy) this.sendHome(toy);
  }

  /** The lobby says who really has a toy, after this game took one it could not have. */
  setHolder(toyId: string, by: string | null, at: ToyPlace | null): void {
    const toy = this.toys.get(toyId);
    if (!toy || toy.holderId === by) return;
    if (by !== null) {
      this.makeWay({ type: 'pickUp', toyId, playerId: by });
      this.apply({ type: 'pickUp', toyId, playerId: by });
    } else {
      this.sendHome(toy);
      if (at) this.apply({ type: 'rest', toyId, at });
    }
  }

  /** The loose toys this game is moving, to tell the others where they are. `index` is the toy's place in the lobby's list. */
  forEachMoving(each: (index: number, toy: Toy) => void): void {
    if (this.sharedAs === null) return;
    this.toyList.forEach((toy, index) => {
      if (toy.holderId === null && toy.sim === 'here' && !this.physics.isAsleep(toy.body)) each(index, toy);
    });
  }

  /** Another game says where a toy it is moving is. */
  hearToy(index: number, x: number, y: number, z: number, qx: number, qy: number, qz: number, qw: number): void {
    const toy = this.toyList[index];
    if (!toy || toy.holderId !== null || toy.sim !== 'there') return;
    toy.goalPosition.set(x, y, z);
    toy.goalQuaternion.set(qx, qy, qz, qw).normalize();
  }

  // -----------------------------------------------------------------------------

  private carriedBy(playerId: string): Toy | null {
    for (const toy of this.toys.values()) if (toy.holderId === playerId) return toy;
    return null;
  }

  private loose(toyId: string): boolean {
    const toy = this.toys.get(toyId);
    return !!toy && toy.holderId === null;
  }

  /**
   * From now another game moves this toy: it stays where it is until that
   * game says otherwise. It is out of this game's physics meanwhile, so that
   * only the game moving it decides what it knocks.
   */
  private follow(toy: Toy): void {
    toy.sim = 'there';
    toy.goalPosition.copy(toy.position);
    toy.goalQuaternion.copy(toy.quaternion);
    toy.lastVelocity.set(0, 0, 0);
    this.physics.holdBody(toy.body);
  }

  /**
   * Put a toy, still, where it last came to rest. It is left awake to settle
   * there: a body put to sleep the moment it is moved sinks into what is
   * under it when it next wakes.
   */
  private layToRest(toy: Toy): void {
    toy.position.copy(toy.restPosition);
    toy.quaternion.copy(toy.restQuaternion);
    toy.lastVelocity.set(0, 0, 0);
    toy.adrift = 0;
    this.physics.releaseBody(toy.body, toy.position, toy.quaternion, ZERO);
  }

  /** Whether a toy this game is moving is close enough to have knocked this one. */
  private knockedByMine(toy: Toy): boolean {
    for (const other of this.toys.values()) {
      if (other === toy || other.holderId !== null || other.sim !== 'here' || this.physics.isAsleep(other.body)) continue;
      const gap = other.position.distanceTo(toy.position) - (other.def.size + toy.def.size) / 2;
      if (gap < KNOCK_RANGE) return true;
    }
    return false;
  }

  private carry(toy: Toy, player: Player, dt: number): void {
    toy.quaternion.copy(player.head.quaternion);
    const target = carryPosition(player.head, this.point);
    if (!toy.def.dangles) {
      toy.position.copy(target);
      return;
    }
    // A dangling toy hangs a little lower and lags behind on a soft spring,
    // so it swings as the head moves.
    target.y -= DANGLE_DROP;
    const step = Math.min(dt, 1 / 30);
    const swing = toy.lastVelocity;
    swing.addScaledVector(this.v.copy(target).sub(toy.position), DANGLE_STIFFNESS * step);
    swing.multiplyScalar(Math.exp(-DANGLE_DAMPING * step));
    toy.position.addScaledVector(swing, step);
    // Never let it trail far behind in fast flight.
    const lag = this.v.copy(toy.position).sub(target);
    if (lag.length() > 0.25) toy.position.copy(target).add(lag.setLength(0.25));
  }

  private touch(peckable: Peckable, player: Player, part: string, point: Vector3, actions: ActionLayer): boolean {
    const key = `${player.id}:${part}`;
    const inside = point.distanceTo(peckable.position) < peckable.def.radius + BEAK_RADIUS;
    if (!inside) {
      peckable.touching.delete(key);
      return false;
    }
    if (peckable.touching.has(key)) return false;
    peckable.touching.add(key);
    return actions.dispatch({ type: 'ring', objectId: peckable.def.id, playerId: player.id });
  }

  /** A ring is flown when the head crosses its plane inside the hoop. */
  private flyRings(player: Player, actions: ActionLayer): void {
    const head = player.head.position;
    let last = this.lastHead.get(player.id);
    if (!last) {
      last = head.clone();
      this.lastHead.set(player.id, last);
    }
    for (const ring of this.rings.values()) {
      const before = this.v.copy(last).sub(ring.position).dot(ring.normal);
      const after = this.v.copy(head).sub(ring.position).dot(ring.normal);
      if (before * after >= 0 || ring.passed) continue;
      // Where the head's path met the ring's plane.
      const t = before / (before - after);
      const crossing = this.point.lerpVectors(last, head, t);
      if (crossing.distanceTo(ring.position) > ring.def.radius * RING_PASS) continue;
      actions.dispatch({ type: 'passRing', ringId: ring.def.id, playerId: player.id });
      let all = true;
      for (const other of this.rings.values()) all &&= other.passed;
      if (all) actions.dispatch({ type: 'celebrate', what: 'rings' });
    }
    last.copy(head);
  }

  private splash(player: Player, actions: ActionLayer): void {
    for (const water of this.water.values()) {
      const check = (part: string, x: number, y: number, z: number): void => {
        const key = `${player.id}:${part}`;
        const inside =
          y < water.position.y + WATER_DEPTH &&
          Math.hypot(x - water.position.x, z - water.position.z) < water.def.radius;
        if (!inside) water.touching.delete(key);
        else if (!water.touching.has(key)) {
          water.touching.add(key);
          actions.dispatch({ type: 'splash', waterId: water.def.id, playerId: player.id });
        }
      };
      const head = player.head.position;
      check('body', head.x, head.y - movementConfig.bodyHeight.value, head.z);
      for (const h of HANDS) {
        const p = player.hands[h].grip.position;
        check(h, p.x, p.y - movementConfig.handRadius.value, p.z);
      }
    }
  }

  private tickStray(toy: Toy, dt: number, actions: ActionLayer): void {
    if (toy.position.distanceTo(toy.home) < STRAY_DISTANCE) {
      toy.strayTime = 0;
      return;
    }
    toy.strayTime += dt;
    if (toy.strayTime >= RETURN_AFTER) this.goHome(toy, actions);
  }

  /** A loose toy this game answers for goes back to where it started. With others about, they are told. */
  private goHome(toy: Toy, actions: ActionLayer): void {
    if (this.sharedAs === null) this.sendHome(toy);
    else actions.dispatch({ type: 'home', toyId: toy.id });
  }

  /** Put a toy back where it started, out of anybody's beak. */
  private sendHome(toy: Toy): void {
    const holder = toy.holderId === null ? undefined : this.players.get(toy.holderId);
    if (holder) holder.carriedItemId = null;
    toy.holderId = null;
    toy.position.copy(toy.home);
    toy.quaternion.identity();
    toy.restPosition.copy(toy.home);
    toy.restQuaternion.identity();
    toy.lastVelocity.set(0, 0, 0);
    toy.placedIn = null;
    toy.restTime = 0;
    toy.strayTime = 0;
    toy.adrift = 0;
    toy.sim = 'rest';
    this.physics.releaseBody(toy.body, toy.home, toy.quaternion, ZERO);
  }

  /** The target whose space this toy is in and which takes this kind of toy. */
  private targetAt(toy: Toy): Target | null {
    for (const target of this.targets.values()) {
      if (!accepts(target, toy)) continue;
      // Into the target's own frame, where its space is an upright box.
      const yaw = target.def.yaw ?? 0;
      const dx = toy.position.x - target.position.x;
      const dz = toy.position.z - target.position.z;
      const lx = dx * Math.cos(yaw) - dz * Math.sin(yaw);
      const lz = dx * Math.sin(yaw) + dz * Math.cos(yaw);
      const ly = toy.position.y - target.position.y;
      const { zoneCenter: c, zoneHalf: half } = target;
      if (Math.abs(lx - c.x) < half.x && Math.abs(ly - c.y) < half.y && Math.abs(lz - c.z) < half.z) {
        return target;
      }
    }
    return null;
  }
}

function accepts(target: Target, toy: Toy): boolean {
  return !target.def.accepts || target.def.accepts.includes(toy.type);
}

const placeOf = (toy: Toy): ToyPlace => [
  toy.position.x,
  toy.position.y,
  toy.position.z,
  toy.quaternion.x,
  toy.quaternion.y,
  toy.quaternion.z,
  toy.quaternion.w,
];
