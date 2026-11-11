import { Quaternion, Vector3 } from 'three';
import { movementConfig } from '../config/movement';
import type { BodyRef, PhysicsWorld } from '../engine/physics';
import { HANDS } from '../player/Player';
import type { Player } from '../player/Player';
import type { Action, ActionLayer } from './actions';
import { BEAK_RADIUS, beakPosition, carryPosition } from './beak';
import { toyCollider } from './types';
import type { LobbyContent, PeckableDef, RingDef, TargetDef, ToyTypeDef, WaterDef } from './types';

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
const DANGLE_DROP = 0.1; // m a dangling toy hangs below the carry point
const DANGLE_STIFFNESS = 90; // 1/s2
const DANGLE_DAMPING = 5; // 1/s

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
  /** Seconds it has lain away from home, unplaced and untouched. */
  strayTime: number;
  /** Physics velocity when loose; swing velocity while carried and dangling. */
  readonly lastVelocity: Vector3;
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

export interface Water {
  readonly def: WaterDef;
  readonly position: Vector3;
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
  readonly rings = new Map<string, Ring>();
  readonly water = new Map<string, Water>();
  readonly players = new Map<string, Player>();
  /** Bells rung since every bell was last rung. */
  readonly bellsRung = new Set<string>();
  /** Called when a jingling toy is knocked; strength is 0..1. */
  onJingle: ((toy: Toy, strength: number) => void) | null = null;

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
        placedIn: null,
        restTime: 0,
        strayTime: 0,
        lastVelocity: new Vector3(),
      });
    }
  }

  /** Forget the lobby's contents. The physics world is cleared separately. */
  clear(): void {
    this.toys.clear();
    this.targets.clear();
    this.peckables.clear();
    this.rings.clear();
    this.water.clear();
    this.bellsRung.clear();
    this.lastHead.clear();
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
        const target = this.targets.get(action.targetId);
        return !!toy && !!target && toy.holderId === null && accepts(target, toy);
      }
      case 'ring':
        return this.peckables.has(action.objectId);
      case 'passRing':
        return this.rings.has(action.ringId);
      case 'splash':
        return this.water.has(action.waterId);
      case 'celebrate':
        return true;
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
        toy.strayTime = 0;
        toy.lastVelocity.set(0, 0, 0);
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
        toy.strayTime = 0;
        player.carriedItemId = null;
        break;
      }
      case 'place':
        this.toys.get(action.toyId)!.placedIn = action.targetId;
        break;
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
      case 'splash':
        break; // Only heard and seen.
    }
  }

  /** One fixed simulation step, after physics has stepped. */
  step(dt: number, actions: ActionLayer): void {
    for (const toy of this.toys.values()) {
      if (toy.holderId !== null) continue;
      if (this.physics.isAsleep(toy.body)) {
        // Nothing moves a sleeping toy, so only its stray clock runs.
        if (toy.placedIn === null) this.tickStray(toy, dt);
        continue;
      }
      this.physics.readBody(toy.body, toy.position, toy.quaternion);

      if (toy.position.y < LOST_BELOW_Y) {
        this.sendHome(toy);
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
        this.tickStray(toy, dt);
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

  private tickStray(toy: Toy, dt: number): void {
    if (toy.position.distanceTo(toy.home) < STRAY_DISTANCE) {
      toy.strayTime = 0;
      return;
    }
    toy.strayTime += dt;
    if (toy.strayTime >= RETURN_AFTER) this.sendHome(toy);
  }

  private sendHome(toy: Toy): void {
    toy.position.copy(toy.home);
    this.physics.releaseBody(toy.body, toy.home, toy.quaternion.identity(), this.v.set(0, 0, 0));
    toy.lastVelocity.set(0, 0, 0);
    toy.placedIn = null;
    toy.restTime = 0;
    toy.strayTime = 0;
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
