import { Vector3 } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { LOBBY_SIZE } from '../shared/net';
import { PhysicsWorld } from '../src/engine/physics';
import { flockConfig } from '../src/flock/config';
import { StaticBuilder } from '../src/lobbies/build';
import {
  BELL_HOOKS,
  CAP_SPOTS,
  CONTENT,
  HALF,
  HEIGHT,
  HOUSES,
  SHOPS,
  SPAWNS,
  STALLS,
  TOWER,
  TOWN_HALL,
  TREES,
} from '../src/lobbies/downhamMarket/layout';
import { buildScenery } from '../src/lobbies/downhamMarket/scenery';
import { lobbyRegistry } from '../src/lobbies/registry';
import { placeAt, stepMovement } from '../src/movement/step';
import type { MoveInput } from '../src/movement/types';
import { Player } from '../src/player/Player';
import { ActionLayer } from '../src/world/actions';
import type { Vec3 } from '../src/world/types';
import { WorldState } from '../src/world/WorldState';
import { cfg, DT, HEAD_Y } from './harness';

// The real Downham Market: its scenery colliders and its toys, with no rendering.

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
const inside = (p: Vec3): boolean => Math.abs(p[0]) < HALF && Math.abs(p[2]) < HALF && p[1] >= 0 && p[1] < HEIGHT;
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
  it('is in the registry under its own id', async () => {
    const place = await lobbyRegistry['downham-market']();
    expect(place.id).toBe('downham-market');
    expect(place.content).toBe(CONTENT);
  });

  it('has the landmarks a child knows the town by, and a town round them', () => {
    // The clock tower stands over the market place, and the Town Hall over its shops.
    expect(TOWER.vane).toBeGreaterThan(12);
    expect(TOWN_HALL.cupola.vane).toBeGreaterThan(Math.max(...SHOPS.map((shop) => shop.h)));
    expect(STALLS.length).toBeGreaterThanOrEqual(4);
    expect(SHOPS.length).toBeGreaterThanOrEqual(12);
    expect(HOUSES.length).toBeGreaterThanOrEqual(30);
    expect(TREES.length).toBeGreaterThanOrEqual(6);
  });

  it('has the same kinds of play as the Aviary', () => {
    expect(CONTENT.toys.length).toBeGreaterThanOrEqual(20);
    expect(CONTENT.toys.length).toBeLessThanOrEqual(30);
    const types = new Set(CONTENT.toys.map((t) => t.type));
    expect([...types].sort()).toEqual(['bellBall', 'bottleCap', 'feather', 'millet', 'ropeKnot', 'seed', 'woodBlock']);
    const kinds = new Set(CONTENT.targets.map((t) => t.kind));
    expect([...kinds].sort()).toEqual(['feeder', 'toyBox']);
    expect(CONTENT.rings.length).toBeGreaterThanOrEqual(8);
    expect(CONTENT.peckables.length).toBeGreaterThanOrEqual(4);
    expect(CONTENT.water).toHaveLength(1);
    expect(CONTENT.gate).toBeDefined();
  });

  it('has no nest things: they stay in the Aviary', () => {
    expect(CONTENT.petCorner).toBeUndefined();
    expect(CONTENT.characterPerches).toBeUndefined();
    expect(CONTENT.helperPlaces).toBeUndefined();
    expect(CONTENT.flock!.parrots.some((parrot) => parrot.helper)).toBe(false);
  });

  it('gives every toy and object a unique id', () => {
    const ids = [
      ...CONTENT.toys,
      ...CONTENT.targets,
      ...CONTENT.peckables,
      ...CONTENT.rings,
      ...CONTENT.water,
      ...CONTENT.flock!.parrots,
    ].map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('stays inside the triangle budget', () => {
    expect(triangles).toBeLessThan(100_000);
  });
});

describe('placement', () => {
  it('keeps everything inside the walls', () => {
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
      expect(clearance(v(ring.position), ring.radius), ring.id).toBeGreaterThan(ring.radius);
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
      const fits = offsets.some((o) => clearance(v(item.position).add(v(o)), body) >= body - 0.001);
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

  it('hides each bottle cap on something solid, high up', () => {
    expect(CAP_SPOTS).toHaveLength(4);
    for (const [i, spot] of CAP_SPOTS.entries()) {
      expect(spot[1], `cap ${i + 1}`).toBeGreaterThan(4);
      expect(physics.groundBelow(v(spot).add(new Vector3(0, 0.3, 0)), 1), `cap ${i + 1}`).toBeCloseTo(spot[1], 1);
    }
  });

  it('gives the town\'s parrots solid places to perch, with room to stand', () => {
    const body = flockConfig.bodyRadius.value;
    const { spots, parrots } = CONTENT.flock!;
    for (const [i, spot] of spots.entries()) {
      expect(inside(spot), `spot ${i}`).toBe(true);
      expect(physics.groundBelow(v(spot).add(new Vector3(0, 0.3, 0)), 1), `spot ${i}`).toBeCloseTo(spot[1], 0);
      expect(clearance(v(spot).add(new Vector3(0, body + 0.05, 0)), body), `spot ${i}`).toBeGreaterThanOrEqual(body - 0.05);
    }
    for (const parrot of parrots) expect(spots[parrot.home], parrot.id).toBeDefined();
  });
});

describe('the player', () => {
  it('has a place of their own to start for everyone a lobby holds, standing in the market place', () => {
    expect(SPAWNS).toHaveLength(LOBBY_SIZE);
    for (const [i, spawn] of SPAWNS.entries()) {
      const player = new Player('p', 'nova');
      const input = newInput();
      placeAt(player, input, cfg, v(spawn));
      simulate(player, input, 1);
      expect(player.movementState, `place ${i}`).toBe('standing');
      expect(player.position.y + HEAD_Y - cfg.bodyHeight.value, `place ${i}`).toBeCloseTo(0, 1);
      const head = player.position.clone().add(input.head);
      expect(Math.hypot(head.x - spawn[0], head.z - spawn[2]), `place ${i}`).toBeLessThan(0.05);
      for (const other of SPAWNS.slice(i + 1)) expect(v(other).distanceTo(v(spawn)), `place ${i}`).toBeGreaterThan(0.4);
    }
  });

  it('can never fly out past the houses or through the ceiling', () => {
    const directions: Vec3[] = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0], [1, 1, 1]];
    for (const d of directions) {
      const player = new Player('p', 'nova');
      const input = newInput();
      placeAt(player, input, cfg, new Vector3(3, 24, 12));
      const push = v(d).normalize().multiplyScalar(cfg.maxFlySpeed.value);
      for (let t = 0; t < 14; t += DT) {
        player.velocity.copy(push); // keep flying flat out at the boundary
        stepMovement(player, input, physics, cfg, DT);
      }
      const head = player.position.clone().add(input.head);
      expect(Math.abs(head.x), d.join()).toBeLessThan(HALF);
      expect(Math.abs(head.z), d.join()).toBeLessThan(HALF);
      expect(head.y, d.join()).toBeLessThan(HEIGHT - 0.05);
    }
  });

  it('can land on a roof, a market stall and the tower\'s steps', () => {
    const tops: [string, Vec3][] = [
      ['a shop roof', [SHOPS[1].x, SHOPS[1].h + 0.3, SHOPS[1].z]],
      ['the Town Hall roof', [TOWN_HALL.body.x - 3, TOWN_HALL.body.h + 0.3, TOWN_HALL.body.z]],
      ['a stall', [STALLS[0].x, 2.36, STALLS[0].z]],
      ['the tower steps', [0, TOWER.steps[1].top, 1.75]],
    ];
    for (const [name, top] of tops) {
      const player = new Player('p', 'nova');
      const input = newInput();
      placeAt(player, input, cfg, new Vector3(top[0], top[1] + 0.5, top[2]));
      simulate(player, input, 2);
      expect(player.movementState, name).toBe('standing');
      expect(player.position.y + HEAD_Y - cfg.bodyHeight.value, name).toBeCloseTo(top[1], 1);
    }
  });
});
