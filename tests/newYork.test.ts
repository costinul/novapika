import { Vector3 } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { LOBBY_SIZE } from '../shared/net';
import { PhysicsWorld } from '../src/engine/physics';
import { flockConfig } from '../src/flock/config';
import { StaticBuilder } from '../src/lobbies/build';
import {
  BELL_HOOKS,
  BLOCKS,
  CAP_SPOTS,
  CONTENT,
  EMPIRE,
  HALF,
  HEIGHT,
  HOUSES,
  LIBERTY,
  ONE_TIMES_SQUARE,
  SHOPS,
  SHORE,
  SPAWNS,
  SQUARE_BUILDINGS,
  STEPS_TOP,
  TAXIS,
  TREES,
  WATER_Y,
} from '../src/lobbies/newYork/layout';
import { buildScenery } from '../src/lobbies/newYork/scenery';
import { lobbyRegistry } from '../src/lobbies/registry';
import { roofTop } from '../src/lobbies/town';
import { placeAt, stepMovement } from '../src/movement/step';
import type { MoveInput } from '../src/movement/types';
import { HANDS, Player } from '../src/player/Player';
import { ActionLayer } from '../src/world/actions';
import type { Action } from '../src/world/actions';
import type { Vec3 } from '../src/world/types';
import { WorldState } from '../src/world/WorldState';
import { cfg, DT, HEAD_Y } from './harness';

// The real New York: its scenery colliders and its toys, with no rendering.

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

/** Give a player the head and hands the movement was run with, so that what they touch can be worked out. */
function pose(player: Player, input: MoveInput): void {
  player.input.head.position.copy(input.head);
  for (const h of HANDS) player.input.hands[h].grip.position.copy(input.hands[h].position);
  player.updateWorldPoses();
}

/** Put a player down from a little above a point, and say how high their feet come to rest. */
function landOn(top: Vec3): { state: string; feet: number } {
  const player = new Player('p', 'nova');
  const input = newInput();
  placeAt(player, input, cfg, new Vector3(top[0], top[1] + 0.5, top[2]));
  simulate(player, input, 2);
  return { state: player.movementState, feet: player.position.y + HEAD_Y - cfg.bodyHeight.value };
}

/** Put a player down at a point, and say whether the water there splashes them. */
function splashesAt(at: Vec3): { feet: number; splashed: boolean } {
  const seen: Action[] = [];
  const place = new WorldState(physics);
  const layer = new ActionLayer(place);
  layer.onApplied((action) => seen.push(action));
  const player = new Player('wader', 'nova');
  place.players.set(player.id, player);
  place.load({ ...CONTENT, toys: [], targets: [] });
  const input = newInput();
  placeAt(player, input, cfg, new Vector3(at[0], at[1] + 0.5, at[2]));
  simulate(player, input, 2);
  pose(player, input);
  place.updateInteractions(layer, DT);
  return { feet: player.position.y + HEAD_Y - cfg.bodyHeight.value, splashed: seen.some((action) => action.type === 'splash') };
}

describe('contents', () => {
  it('is in the registry under its own id', async () => {
    const place = await lobbyRegistry['new-york']();
    expect(place.id).toBe('new-york');
    expect(place.content).toBe(CONTENT);
  });

  it('has the landmarks a child knows New York by, and a city round them', () => {
    // The Empire State Building is the tallest thing there is.
    const tops = [LIBERTY.torch, ONE_TIMES_SQUARE.ball, ...[...BLOCKS, ...HOUSES, ...SHOPS, ...SQUARE_BUILDINGS].map(roofTop)];
    expect(EMPIRE.mast).toBeGreaterThan(Math.max(...tops));
    expect(EMPIRE.mast).toBeLessThan(HEIGHT);
    // It steps in as it goes up, leaving a ledge wide enough to stand on at every step.
    EMPIRE.tiers.slice(1).forEach((tier, i) => expect((EMPIRE.tiers[i].side - tier.side) / 2, `ledge ${i + 1}`).toBeGreaterThanOrEqual(1));
    expect(SQUARE_BUILDINGS).toHaveLength(4);
    expect(TAXIS.length).toBeGreaterThanOrEqual(3);
    // The statue stands on an island out in the harbour.
    expect(LIBERTY.x - LIBERTY.island).toBeGreaterThan(SHORE);
    expect(LIBERTY.x + LIBERTY.island).toBeLessThan(HALF);
    expect(HOUSES.length).toBeGreaterThanOrEqual(30);
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

describe('the harbour', () => {
  it('splashes from one end to the other', () => {
    const middle = (SHORE + HALF) / 2;
    for (let z = -HALF + 1; z < HALF; z += 2) {
      const wet = CONTENT.water.some((water) => Math.hypot(middle - water.position[0], z - water.position[2]) < water.radius);
      expect(wet, `z ${z}`).toBe(true);
    }
    for (const water of CONTENT.water) {
      expect(water.position[0] - water.radius).toBeGreaterThanOrEqual(SHORE - 0.001);
      expect(water.position[1]).toBeCloseTo(WATER_Y, 1);
    }
  });

  it('is shallow: a parrot stands in it, and splashes', () => {
    const { feet, splashed } = splashesAt([52, WATER_Y, -30]);
    expect(feet).toBeCloseTo(WATER_Y, 1);
    expect(splashed).toBe(true);
  });

  it("does not splash a parrot on the statue's island, or on the walk beside the water", () => {
    const island = splashesAt([LIBERTY.x - 5, 0, LIBERTY.z - 3]);
    expect(island.feet).toBeCloseTo(0, 1);
    expect(island.splashed).toBe(false);
    const walk = splashesAt([SHORE - 2, 0, -30]);
    expect(walk.feet).toBeCloseTo(0, 1);
    expect(walk.splashed).toBe(false);
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

  it("gives New York's parrots solid places to perch, with room to stand", () => {
    const body = flockConfig.bodyRadius.value;
    const { spots, parrots } = CONTENT.flock!;
    for (const [i, spot] of spots.entries()) {
      expect(inside(spot), `spot ${i}`).toBe(true);
      expect(physics.groundBelow(v(spot).add(new Vector3(0, 0.3, 0)), 1), `spot ${i}`).toBeCloseTo(spot[1], 0);
      expect(clearance(v(spot).add(new Vector3(0, body + 0.05, 0)), body), `spot ${i}`).toBeGreaterThanOrEqual(body - 0.05);
    }
    for (const parrot of parrots) expect(spots[parrot.home], parrot.id).toBeDefined();
  });

  it('keeps the taxis off the place where players start', () => {
    for (const taxi of TAXIS) {
      for (const spawn of SPAWNS) expect(Math.hypot(taxi.x - spawn[0], taxi.z - spawn[2])).toBeGreaterThan(4);
    }
  });
});

describe('the player', () => {
  it('has a place of their own to start for everyone a lobby holds, standing in Times Square', () => {
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

  it('can never fly out past the houses, across the harbour or through the ceiling', () => {
    const starts: Vec3[] = [[3, 30, 30], [56, 0.5, -40]];
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
    const empire = (tier: number): Vec3 => [EMPIRE.x + EMPIRE.tiers[tier].side / 2 - 0.6, EMPIRE.tiers[tier].top, EMPIRE.z];
    const tops: [string, Vec3][] = [
      ['the first ledge of the Empire State Building', empire(0)],
      ['its second ledge', empire(1)],
      ['its third ledge', empire(2)],
      ['its last ledge', empire(3)],
      ['the top of the red steps', STEPS_TOP],
      ['a roof on Times Square', [SQUARE_BUILDINGS[0].x, roofTop(SQUARE_BUILDINGS[0]), SQUARE_BUILDINGS[0].z]],
      ['the roof of the tower with the ball', [ONE_TIMES_SQUARE.x + 2, ONE_TIMES_SQUARE.top, ONE_TIMES_SQUARE.z]],
      ["the statue's pedestal", [LIBERTY.x + 1.6, LIBERTY.pedestal.top, LIBERTY.z - 1.6]],
      ["the statue's island", [LIBERTY.x, 0, LIBERTY.z + 5.5]],
    ];
    for (const [name, top] of tops) {
      const { state, feet } = landOn(top);
      expect(state, name).toBe('standing');
      expect(feet, name).toBeCloseTo(top[1], 1);
    }
  });

  it('can climb the red steps a step at a time', () => {
    // Each step is low enough to hop: lower than a parrot's body is tall.
    expect(STEPS_TOP[1] / 6).toBeLessThan(cfg.bodyHeight.value);
  });
});
