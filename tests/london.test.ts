import { Vector3 } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { LOBBY_SIZE } from '../shared/net';
import { PhysicsWorld } from '../src/engine/physics';
import { flockConfig } from '../src/flock/config';
import { StaticBuilder } from '../src/lobbies/build';
import {
  BELL_HOOKS,
  BIG_BEN,
  BLOCKS,
  BUS,
  CAP_SPOTS,
  CAPSULES,
  CONTENT,
  EYE,
  HALF,
  HEIGHT,
  HOUSES,
  PARLIAMENT,
  RIVER,
  SHOPS,
  SPAWNS,
  TOWER_BRIDGE,
  TREES,
  WATER_Y,
} from '../src/lobbies/london/layout';
import { buildScenery } from '../src/lobbies/london/scenery';
import { lobbyRegistry } from '../src/lobbies/registry';
import { roofTop } from '../src/lobbies/town';
import { placeAt, stepMovement } from '../src/movement/step';
import type { MoveInput } from '../src/movement/types';
import { Player } from '../src/player/Player';
import { ActionLayer } from '../src/world/actions';
import type { Action } from '../src/world/actions';
import type { Vec3 } from '../src/world/types';
import { WorldState } from '../src/world/WorldState';
import { cfg, DT, HEAD_Y } from './harness';

// The real London: its scenery colliders and its toys, with no rendering.

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

/** Put a player down from a little above a point, and say how high their feet come to rest. */
function landOn(top: Vec3): { state: string; feet: number } {
  const player = new Player('p', 'nova');
  const input = newInput();
  placeAt(player, input, cfg, new Vector3(top[0], top[1] + 0.5, top[2]));
  simulate(player, input, 2);
  return { state: player.movementState, feet: player.position.y + HEAD_Y - cfg.bodyHeight.value };
}

describe('contents', () => {
  it('is in the registry under its own id', async () => {
    const place = await lobbyRegistry['london']();
    expect(place.id).toBe('london');
    expect(place.content).toBe(CONTENT);
  });

  it('has the landmarks a child knows London by, and a city round them', () => {
    // Big Ben is the tallest thing there is.
    const tops = [TOWER_BRIDGE.finial, EYE.hub + EYE.radius + 2, ...[...BLOCKS, ...HOUSES, ...SHOPS].map(roofTop)];
    expect(BIG_BEN.finial).toBeGreaterThan(Math.max(...tops));
    expect(BIG_BEN.finial).toBeLessThan(HEIGHT);
    expect(CAPSULES).toHaveLength(EYE.capsules);
    expect(BUS.h).toBeGreaterThan(4);
    expect(HOUSES.length).toBeGreaterThanOrEqual(40);
    expect(TREES.length).toBeGreaterThanOrEqual(8);
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

describe('the Thames', () => {
  it('splashes from one end to the other', () => {
    for (let x = -HALF + 1; x < HALF; x += 2) {
      const wet = CONTENT.water.some((water) => Math.hypot(x - water.position[0], water.position[2]) < water.radius);
      expect(wet, `x ${x}`).toBe(true);
    }
    for (const water of CONTENT.water) {
      expect(water.radius).toBeLessThanOrEqual(RIVER);
      expect(water.position[1]).toBeCloseTo(WATER_Y, 1);
    }
  });

  it('is shallow: a parrot stands in it, and splashes', () => {
    const seen: Action[] = [];
    const river = new WorldState(physics);
    const wading = new ActionLayer(river);
    wading.onApplied((action) => seen.push(action));
    const player = new Player('wader', 'nova');
    river.players.set(player.id, player);
    river.load({ ...CONTENT, toys: [], targets: [] });

    const input = newInput();
    placeAt(player, input, cfg, new Vector3(10, 0.5, 2));
    simulate(player, input, 2);
    expect(player.movementState).toBe('standing');
    expect(player.position.y + HEAD_Y - cfg.bodyHeight.value).toBeCloseTo(WATER_Y, 1);
    player.updateWorldPoses();
    river.updateInteractions(wading, DT);
    expect(seen.some((action) => action.type === 'splash')).toBe(true);
  });

  it('does not splash a parrot on a bridge above it', () => {
    const seen: Action[] = [];
    const river = new WorldState(physics);
    const crossing = new ActionLayer(river);
    crossing.onApplied((action) => seen.push(action));
    const player = new Player('walker', 'nova');
    river.players.set(player.id, player);
    river.load({ ...CONTENT, toys: [], targets: [] });

    const input = newInput();
    placeAt(player, input, cfg, new Vector3(TOWER_BRIDGE.x, 0.3, 0));
    simulate(player, input, 2);
    expect(player.position.y + HEAD_Y - cfg.bodyHeight.value).toBeCloseTo(0, 1);
    player.updateWorldPoses();
    river.updateInteractions(crossing, DT);
    expect(seen.some((action) => action.type === 'splash')).toBe(false);
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

  it('ties every bell to something solid, with room to swing', () => {
    for (const [id, hook] of Object.entries(BELL_HOOKS)) {
      expect(clearance(v(hook), 0.4), id).toBeLessThan(0.4);
    }
    for (const bell of CONTENT.peckables) {
      expect(clearance(v(bell.position), bell.radius + 0.3), bell.id).toBeGreaterThan(bell.radius);
    }
  });

  it('hangs a great bell in the open belfry of Big Ben, with a way in on every side', () => {
    const bell = CONTENT.peckables.find((p) => p.id === 'bell-big-ben')!;
    expect(bell.radius).toBeGreaterThan(0.4);
    const body = cfg.bodyRadius.value;
    const y = BIG_BEN.clock.top + 1.5;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      // From outside the belfry, straight in toward the bell.
      const from = new Vector3(BIG_BEN.x + dx * 6, y, BIG_BEN.z + dz * 6);
      const hit = physics.castSphere(from, new Vector3(-dx, 0, -dz), 6, body);
      expect(hit?.distance ?? Infinity, `${dx},${dz}`).toBeGreaterThan(5);
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

  it("gives London's parrots solid places to perch, with room to stand", () => {
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
  it('has a place of their own to start for everyone a lobby holds, standing by the river', () => {
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

  it('can never fly out past the houses, along the river or through the ceiling', () => {
    const starts: Vec3[] = [[3, 30, 30], [0, 0.5, 0]];
    const directions: Vec3[] = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0], [1, 1, 1]];
    for (const start of starts) {
      for (const d of directions) {
        const player = new Player('p', 'nova');
        const input = newInput();
        placeAt(player, input, cfg, v(start));
        const push = v(d).normalize().multiplyScalar(cfg.maxFlySpeed.value);
        for (let t = 0; t < 20; t += DT) {
          player.velocity.copy(push); // keep flying flat out at the boundary
          stepMovement(player, input, physics, cfg, DT);
        }
        const head = player.position.clone().add(input.head);
        expect(Math.abs(head.x), `${start.join()} ${d.join()}`).toBeLessThan(HALF);
        expect(Math.abs(head.z), `${start.join()} ${d.join()}`).toBeLessThan(HALF);
        expect(head.y, `${start.join()} ${d.join()}`).toBeLessThan(HEIGHT - 0.05);
      }
    }
  });

  it('can land on the landmarks', () => {
    const tops: [string, Vec3][] = [
      ['the roof of Parliament', [PARLIAMENT.x, roofTop(PARLIAMENT), PARLIAMENT.z - 2]],
      ['the roof of the bus', [BUS.x, BUS.h, BUS.z]],
      ['a walkway of Tower Bridge', [TOWER_BRIDGE.x - TOWER_BRIDGE.walkway.aside, TOWER_BRIDGE.walkway.top, 0.5]],
      ["the floor of Big Ben's belfry", [BIG_BEN.x + 1.2, BIG_BEN.clock.top, BIG_BEN.z + 1.2]],
      ['a capsule of the Eye', [CAPSULES[4][0], CAPSULES[4][1] + EYE.capsule.h / 2, CAPSULES[4][2]]],
      ['a bridge', [TOWER_BRIDGE.x, 0, 7]],
    ];
    for (const [name, top] of tops) {
      const { state, feet } = landOn(top);
      expect(state, name).toBe('standing');
      expect(feet, name).toBeCloseTo(top[1], 1);
    }
  });
});
