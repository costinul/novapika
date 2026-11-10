import { Quaternion, Vector3 } from 'three';
import type { BodyRef, PhysicsWorld } from '../engine/physics';
import { HANDS } from '../player/Player';
import type { Player } from '../player/Player';
import type { Action, ActionLayer } from './actions';
import { BEAK_RADIUS, beakPosition, carryPosition } from './beak';
import type { LobbyContent, PeckableDef, TargetDef, ToyTypeDef } from './types';

const BOX_WALL = 0.03; // m, thickness of a toy box's walls and floor
const REST_SPEED = 0.3; // m/s, a toy slower than this is coming to rest
const REST_TIME = 0.25; // s at rest inside a target before it counts as placed
const JINGLE_KNOCK = 1; // m/s, speed change in one step that makes a toy jingle
const LOST_BELOW_Y = -5; // m, a toy below this has left the lobby

export interface Toy {
  readonly id: string;
  readonly type: string;
  readonly def: ToyTypeDef;
  readonly home: Vector3;
  readonly body: BodyRef;
  readonly position: Vector3;
  readonly quaternion: Quaternion;
  /** Id of the player carrying it, or null. Ready for stealing later. */
  holderId: string | null;
  /** Id of the target place it rests in, or null. */
  placedIn: string | null;
  restTime: number;
  readonly lastVelocity: Vector3;
}

export interface Target {
  readonly def: TargetDef;
  /** Inside of the box: a toy resting in here has been placed. */
  readonly min: Vector3;
  readonly max: Vector3;
}

export interface Peckable {
  readonly def: PeckableDef;
  readonly position: Vector3;
  /** Players and parts currently touching it, so one touch rings once. */
  readonly touching: Set<string>;
}

/**
 * The shared state of a lobby's toys and interactive objects. It changes only
 * through actions (see ActionLayer). No rendering and no sound in here.
 */
export class WorldState {
  readonly toys = new Map<string, Toy>();
  readonly targets = new Map<string, Target>();
  readonly peckables = new Map<string, Peckable>();
  readonly players = new Map<string, Player>();
  /** Called when a jingling toy is knocked; strength is 0..1. */
  onJingle: ((toy: Toy, strength: number) => void) | null = null;

  private readonly v = new Vector3();
  private readonly beak = new Vector3();

  constructor(private readonly physics: PhysicsWorld) {}

  /** Create a lobby's toys and interactive objects. */
  load(content: LobbyContent): void {
    for (const def of content.targets) {
      const [x, y, z] = def.position;
      const [w, h, d] = def.size;
      const t = BOX_WALL / 2;
      this.physics.addStaticBox([x, y + t, z], [w / 2, t, d / 2]);
      this.physics.addStaticBox([x - w / 2 + t, y + h / 2, z], [t, h / 2, d / 2]);
      this.physics.addStaticBox([x + w / 2 - t, y + h / 2, z], [t, h / 2, d / 2]);
      this.physics.addStaticBox([x, y + h / 2, z - d / 2 + t], [w / 2, h / 2, t]);
      this.physics.addStaticBox([x, y + h / 2, z + d / 2 - t], [w / 2, h / 2, t]);
      this.targets.set(def.id, {
        def,
        min: new Vector3(x - w / 2, y, z - d / 2),
        max: new Vector3(x + w / 2, y + h, z + d / 2),
      });
    }

    for (const def of content.peckables) {
      this.peckables.set(def.id, { def, position: new Vector3(...def.position), touching: new Set() });
    }

    for (const { id, type, position } of content.toys) {
      const def = content.toyTypes[type];
      if (!def) throw new Error(`Toy "${id}" has unknown type "${type}"`);
      this.toys.set(id, {
        id,
        type,
        def,
        home: new Vector3(...position),
        body: this.physics.addToyBody(def.shape, def.size, position, def.density, def.bounce),
        position: new Vector3(...position),
        quaternion: new Quaternion(),
        holderId: null,
        placedIn: null,
        restTime: 0,
        lastVelocity: new Vector3(),
      });
    }
  }

  /** Forget the lobby's contents. The physics world is cleared separately. */
  clear(): void {
    this.toys.clear();
    this.targets.clear();
    this.peckables.clear();
    for (const player of this.players.values()) player.carriedItemId = null;
  }

  /** Would this action be valid right now? */
  allows(action: Action): boolean {
    switch (action.type) {
      case 'pickUp': {
        const player = this.players.get(action.playerId);
        const toy = this.toys.get(action.toyId);
        return !!player && !!toy && player.carriedItemId === null && toy.holderId === null;
      }
      case 'drop':
        return !!this.players.get(action.playerId)?.carriedItemId;
      case 'place': {
        const toy = this.toys.get(action.toyId);
        return !!toy && toy.holderId === null && this.targets.has(action.targetId);
      }
      case 'ring':
        return this.peckables.has(action.objectId);
    }
  }

  /** Apply an approved action. Only ActionLayer calls this. */
  apply(action: Action): void {
    switch (action.type) {
      case 'pickUp': {
        const player = this.players.get(action.playerId)!;
        const toy = this.toys.get(action.toyId)!;
        toy.holderId = player.id;
        toy.placedIn = null;
        toy.restTime = 0;
        player.carriedItemId = toy.id;
        this.physics.holdBody(toy.body);
        break;
      }
      case 'drop': {
        const player = this.players.get(action.playerId)!;
        const toy = this.toys.get(player.carriedItemId!)!;
        carryPosition(player.head, toy.position);
        this.physics.releaseBody(toy.body, toy.position, toy.quaternion, player.velocity);
        toy.lastVelocity.copy(player.velocity);
        toy.holderId = null;
        player.carriedItemId = null;
        break;
      }
      case 'place':
        this.toys.get(action.toyId)!.placedIn = action.targetId;
        break;
      case 'ring':
        break; // A bell has no state: ringing it is only heard and seen.
    }
  }

  /** One fixed simulation step, after physics has stepped. */
  step(dt: number, actions: ActionLayer): void {
    for (const toy of this.toys.values()) {
      if (toy.holderId !== null) continue;
      this.physics.readBody(toy.body, toy.position, toy.quaternion);

      if (toy.position.y < LOST_BELOW_Y) {
        toy.position.copy(toy.home);
        this.physics.releaseBody(toy.body, toy.home, toy.quaternion.identity(), this.v.set(0, 0, 0));
        toy.lastVelocity.set(0, 0, 0);
        toy.placedIn = null;
        continue;
      }

      const velocity = this.physics.bodyVelocity(toy.body, this.v);
      if (toy.def.jingles && this.onJingle) {
        const knock = velocity.distanceTo(toy.lastVelocity);
        if (knock > JINGLE_KNOCK) this.onJingle(toy, Math.min(1, knock / 6));
      }
      toy.lastVelocity.copy(velocity);

      if (toy.placedIn !== null) continue;
      const target = velocity.length() < REST_SPEED ? this.targetAt(toy.position) : null;
      toy.restTime = target ? toy.restTime + dt : 0;
      if (target && toy.restTime >= REST_TIME) {
        actions.dispatch({ type: 'place', toyId: toy.id, targetId: target.def.id });
      }
    }
  }

  /**
   * Once per drawn frame, with fresh head and hand poses: carried toys follow
   * their holder, and beaks and hands that touch a bell ring it.
   */
  updateInteractions(actions: ActionLayer): void {
    for (const player of this.players.values()) {
      const toy = player.carriedItemId ? this.toys.get(player.carriedItemId) : undefined;
      if (toy) {
        carryPosition(player.head, toy.position);
        toy.quaternion.copy(player.head.quaternion);
      }

      beakPosition(player.head, this.beak);
      for (const peckable of this.peckables.values()) {
        this.touch(peckable, player, 'beak', this.beak, BEAK_RADIUS, actions);
        for (const h of HANDS) {
          this.touch(peckable, player, h, player.hands[h].grip.position, BEAK_RADIUS, actions);
        }
      }
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

  private touch(
    peckable: Peckable,
    player: Player,
    part: string,
    point: Vector3,
    radius: number,
    actions: ActionLayer,
  ): void {
    const key = `${player.id}:${part}`;
    const inside = point.distanceTo(peckable.position) < peckable.def.radius + radius;
    if (inside && !peckable.touching.has(key)) {
      peckable.touching.add(key);
      actions.dispatch({ type: 'ring', objectId: peckable.def.id, playerId: player.id });
    } else if (!inside) {
      peckable.touching.delete(key);
    }
  }

  private targetAt(point: Vector3): Target | null {
    for (const target of this.targets.values()) {
      const { min, max } = target;
      if (
        point.x > min.x && point.x < max.x &&
        point.y > min.y && point.y < max.y &&
        point.z > min.z && point.z < max.z
      ) {
        return target;
      }
    }
    return null;
  }
}
