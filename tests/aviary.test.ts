import { Vector3 } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { PhysicsWorld } from '../src/engine/physics';
import { CONTENT, HALF, HEIGHT, NEST_Y, SPAWN, TREES, BELL_HOOKS } from '../src/lobbies/aviary/layout';
import { buildScenery } from '../src/lobbies/aviary/scenery';
import { StaticBuilder } from '../src/lobbies/build';
import { lobbyRegistry } from '../src/lobbies/registry';
import { placeAt, stepMovement } from '../src/movement/step';
import type { MoveInput } from '../src/movement/types';
import { Player } from '../src/player/Player';
import { ActionLayer } from '../src/world/actions';
import type { Vec3 } from '../src/world/types';
import { WorldState } from '../src/world/WorldState';
import { cfg, DT, HEAD_Y } from './harness';

// The real Aviary: its scenery colliders and its toys, with no rendering.

let physics: PhysicsWorld;
let world: WorldState;
let actions: ActionLayer;
let triangles = 0;

beforeAll(async () => {
  physics = await PhysicsWorld.create();
  const builder = new StaticBuilder(physics);
  buildScenery(builder);
  triangles = builder.mesh().geometry.attributes.position.count / 3;
  world = new WorldState(physics);
  world.load(CONTENT);
  actions = new ActionLayer(world);
  physics.step(DT);
});

const v = (p: Vec3): Vector3 => new Vector3(...p);
const inside = (p: Vec3): boolean =>
  Math.abs(p[0]) < HALF && Math.abs(p[2]) < HALF && p[1] >= 0 && p[1] < HEIGHT;
/** Distance from a point to the nearest solid, or Infinity if none within `reach`. */
const clearance = (p: Vector3, reach: number): number => physics.nearestSurface(p, reach)?.distance ?? Infinity;

function newInput(): MoveInput {
  return {
    head: new Vector3(0, HEAD_Y, 0),
    headForward: new Vector3(0, 0, -1),
    hands: {
      left: { position: new Vector3(-0.1, HEAD_Y - 0.25, -0.1), gripPressed: false },
      right: { position: new Vector3(0.1, HEAD_Y - 0.25, -0.1), gripPressed: false },
    },
  };
}

function simulate(player: Player, input: MoveInput, seconds: number): void {
  for (let t = 0; t < seconds; t += DT) stepMovement(player, input, physics, cfg, DT);
}

describe('contents', () => {
  it('has everything the requirements list', () => {
    expect(TREES.length).toBeGreaterThanOrEqual(6);
    expect(TREES.length).toBeLessThanOrEqual(10);
    expect(CONTENT.toys.length).toBeGreaterThanOrEqual(20);
    expect(CONTENT.toys.length).toBeLessThanOrEqual(30);
    const types = new Set(CONTENT.toys.map((t) => t.type));
    expect([...types].sort()).toEqual(
      ['bellBall', 'bottleCap', 'feather', 'millet', 'ropeKnot', 'seed', 'woodBlock'],
    );
    const kinds = new Set(CONTENT.targets.map((t) => t.kind));
    expect([...kinds].sort()).toEqual(['feeder', 'shelf', 'toyBox']);
    expect(CONTENT.rings.length).toBeGreaterThanOrEqual(8);
    expect(CONTENT.peckables.length).toBeGreaterThanOrEqual(4);
    expect(CONTENT.water).toHaveLength(1);
  });

  it('gives every toy and object a unique id', () => {
    const ids = [
      ...CONTENT.toys,
      ...CONTENT.targets,
      ...CONTENT.peckables,
      ...CONTENT.rings,
      ...CONTENT.water,
    ].map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('stays inside the triangle budget', () => {
    // Scenery only; toys, bells and rings add a few thousand more.
    expect(triangles).toBeLessThan(100_000);
  });
});

describe('placement', () => {
  it('keeps everything inside the netting', () => {
    for (const item of [...CONTENT.toys, ...CONTENT.targets, ...CONTENT.peckables, ...CONTENT.rings]) {
      expect(inside(item.position), item.id).toBe(true);
    }
  });

  it('puts no toy or bell inside something solid', () => {
    for (const item of [...CONTENT.toys, ...CONTENT.peckables]) {
      expect(clearance(v(item.position), 0.02), item.id).toBeGreaterThan(0);
    }
  });

  it('leaves every ring clear to fly through', () => {
    for (const ring of CONTENT.rings) {
      const center = v(ring.position);
      expect(clearance(center, ring.radius), ring.id).toBeGreaterThan(ring.radius);
    }
  });

  it('ties every bell to something solid', () => {
    for (const [id, hook] of Object.entries(BELL_HOOKS)) {
      expect(clearance(v(hook), 0.4), id).toBeLessThan(0.4);
    }
  });

  it('leaves room for a parrot beside every toy and target', () => {
    const body = cfg.bodyRadius.value;
    const offsets: Vec3[] = [[0, 0.5, 0], [0.5, 0.4, 0], [-0.5, 0.4, 0], [0, 0.4, 0.5], [0, 0.4, -0.5]];
    for (const item of [...CONTENT.toys, ...CONTENT.targets]) {
      const fits = offsets.some(
        (o) => clearance(v(item.position).add(v(o)), body) >= body - 0.001,
      );
      expect(fits, item.id).toBe(true);
    }
  });

  it('leaves the toys where they were put once physics settles', () => {
    for (let t = 0; t < 4; t += DT) {
      physics.step(DT);
      world.step(DT, actions);
    }
    for (const def of CONTENT.toys) {
      const toy = world.toys.get(def.id)!;
      expect(toy.position.distanceTo(v(def.position)), def.id).toBeLessThan(0.5);
    }
  });
});

describe('the player', () => {
  it('spawns standing in the nest', () => {
    const player = new Player('p', 'nova');
    const input = newInput();
    placeAt(player, input, cfg, v(SPAWN));
    simulate(player, input, 1);
    expect(player.movementState).toBe('standing');
    expect(player.position.y + HEAD_Y - cfg.bodyHeight.value).toBeCloseTo(NEST_Y, 1);
  });

  it('can never fly out through the netting or the roof', () => {
    const directions: Vec3[] = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0], [1, 1, 1]];
    for (const d of directions) {
      const player = new Player('p', 'nova');
      const input = newInput();
      placeAt(player, input, cfg, new Vector3(3, 20, 12));
      const push = v(d).normalize().multiplyScalar(cfg.maxFlySpeed.value);
      for (let t = 0; t < 12; t += DT) {
        player.velocity.copy(push); // keep flying flat out at the boundary
        stepMovement(player, input, physics, cfg, DT);
      }
      const head = player.position.clone().add(input.head);
      expect(Math.abs(head.x), d.join()).toBeLessThan(HALF);
      expect(Math.abs(head.z), d.join()).toBeLessThan(HALF);
      // The eyes stay clear of the roof netting, not just under it.
      expect(head.y, d.join()).toBeLessThan(HEIGHT - 0.05);
    }
  });

  it('perches on a round branch without sliding off', () => {
    const branch = TREES[1].branches[1];
    const mid = new Vector3().lerpVectors(v(branch.a), v(branch.b), 0.6);
    const player = new Player('p', 'nova');
    const input = newInput();
    // Come down onto the branch a little off its centre line.
    placeAt(player, input, cfg, new Vector3(mid.x + 0.06, mid.y + 0.8, mid.z + 0.06));
    simulate(player, input, 2);
    expect(player.movementState).toBe('standing');
    const rested = player.position.clone();
    simulate(player, input, 3);
    expect(player.position.distanceTo(rested)).toBeLessThan(0.01);
    expect(player.position.y + HEAD_Y - cfg.bodyHeight.value).toBeGreaterThan(mid.y);
  });
});

describe('lobby registry', () => {
  it('swaps to the test room by id alone, leaving nothing of the Aviary behind', async () => {
    const aviary = await lobbyRegistry['aviary']();
    const testRoom = await lobbyRegistry['test-room']();
    expect(aviary.content).toBe(CONTENT);
    expect(world.toys.size).toBe(CONTENT.toys.length);

    // What the engine does to unload one lobby and load the next.
    world.clear();
    physics.clear();
    world.load(testRoom.content!);
    physics.step(DT);

    expect(world.toys.size).toBe(testRoom.content!.toys.length);
    expect(world.rings.size).toBe(0);
    expect(world.water.size).toBe(0);
    expect([...world.toys.keys()].some((id) => id.startsWith('cap-'))).toBe(false);
    // The Aviary's ground is gone: nothing solid at its centre any more.
    expect(physics.nearestSurface(new Vector3(0, 0.5, 0), 5)).toBeNull();
  });
});
