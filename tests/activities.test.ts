import { Vector3 } from 'three';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PhysicsWorld } from '../src/engine/physics';
import { Player } from '../src/player/Player';
import { ActionLayer } from '../src/world/actions';
import type { Action } from '../src/world/actions';
import { BEAK_OFFSET, carryPosition } from '../src/world/beak';
import type { LobbyContent } from '../src/world/types';
import { WorldState } from '../src/world/WorldState';
import { cfg } from './harness';

// The toy kinds and things to do that arrive with the Aviary.

const DT = 1 / 120;

const CONTENT: LobbyContent = {
  toyTypes: {
    block: { shape: 'box', size: 0.12, color: 0, density: 300, bounce: 0.2 },
    knot: { shape: 'knot', size: 0.15, color: 0, density: 120, bounce: 0.3, dangles: true },
    seed: { shape: 'seed', size: 0.08, color: 0, density: 300, bounce: 0.2 },
    feather: { shape: 'feather', size: 0.26, color: 0, density: 40, bounce: 0.05, floatiness: 0.9 },
  },
  toys: [
    { id: 'block', type: 'block', position: [0, 0.06, -1] },
    { id: 'knot', type: 'knot', position: [1, 0.08, -1] },
    { id: 'seed', type: 'seed', position: [2, 0.04, -1] },
    { id: 'feather', type: 'feather', position: [3, 0.02, -1] },
  ],
  targets: [
    { id: 'toy-box', kind: 'toyBox', position: [5, 0, 0], size: [1, 0.35, 0.8], color: 0, accepts: ['block', 'knot', 'feather'] },
    { id: 'feeder', kind: 'feeder', position: [8, 0, 0], size: [1, 0.1, 1], color: 0, accepts: ['seed'] },
    { id: 'shelf', kind: 'shelf', position: [0, 1, 6], size: [1, 0.4, 0.7], yaw: 0.8, color: 0 },
  ],
  peckables: [
    { id: 'bell-a', kind: 'bell', position: [0, 2, 3], radius: 0.12, stringLength: 0.3 },
    { id: 'bell-b', kind: 'bell', position: [2, 2, 3], radius: 0.12, stringLength: 0.3 },
  ],
  rings: [
    { id: 'ring-a', position: [-5, 4, 0], yaw: 0, radius: 1.3 },
    { id: 'ring-b', position: [-9, 5, 0], yaw: Math.PI / 2, radius: 1.3 },
  ],
  water: [{ id: 'pond', position: [-5, 0.03, -8], radius: 3 }],
};

let physics: PhysicsWorld;
let world: WorldState;
let actions: ActionLayer;
let applied: Action[];
let nova: Player;

beforeAll(async () => {
  physics = await PhysicsWorld.create();
});

beforeEach(() => {
  physics.clear();
  physics.addStaticBox([0, -0.5, 0], [50, 0.5, 50]);
  world = new WorldState(physics);
  nova = new Player('nova-player', 'nova');
  world.players.set(nova.id, nova);
  world.load(CONTENT);
  actions = new ActionLayer(world);
  applied = [];
  actions.onApplied((a) => applied.push(a));
  park();
});

/** Put the player somewhere out of the way, hands by the head. */
function park(x = -20, y = 8, z = -20): void {
  nova.head.position.set(x, y, z);
  nova.hands.left.grip.position.set(x - 0.3, y, z);
  nova.hands.right.grip.position.set(x + 0.3, y, z);
}

function run(seconds: number): void {
  for (let t = 0; t < seconds; t += DT) {
    physics.step(DT);
    world.step(DT, actions);
    world.updateInteractions(actions, DT);
  }
}

const toy = (id: string) => world.toys.get(id)!;
const count = (type: Action['type']): number => applied.filter((a) => a.type === type).length;

/** Carry a toy to above a point and let go. */
function deliver(toyId: string, x: number, y: number, z: number): void {
  actions.dispatch({ type: 'pickUp', playerId: nova.id, toyId });
  // The carry point is in front of and below the head; put it over the spot.
  const offset = carryPosition({ position: new Vector3(), quaternion: nova.head.quaternion }, new Vector3());
  park(x - offset.x, y - offset.y, z - offset.z);
  run(0.05);
  actions.dispatch({ type: 'drop', playerId: nova.id });
  park();
}

describe('toy kinds', () => {
  it('lets a feather float down far more slowly than a block', () => {
    deliver('block', 10, 6, 10);
    deliver('feather', 12, 6, 10);
    run(1);
    expect(toy('feather').position.y).toBeGreaterThan(toy('block').position.y + 1.5);
    run(20);
    expect(toy('feather').position.y).toBeLessThan(0.2); // it does land
  });

  it('hangs a rope knot below the beak and lets it swing', () => {
    actions.dispatch({ type: 'pickUp', playerId: nova.id, toyId: 'knot' });
    park(0, 5, 0);
    run(1.5);
    const rest = carryPosition(nova.head, new Vector3());
    expect(toy('knot').position.y).toBeLessThan(rest.y - 0.05);
    expect(Math.abs(toy('knot').position.x - rest.x)).toBeLessThan(0.02);

    // A sudden sideways move leaves it trailing, then it catches up.
    park(0.4, 5, 0);
    run(0.03);
    const moved = carryPosition(nova.head, new Vector3());
    expect(moved.x - toy('knot').position.x).toBeGreaterThan(0.1);
    run(2);
    expect(Math.abs(toy('knot').position.x - moved.x)).toBeLessThan(0.03);
  });
});

describe('target places', () => {
  it('counts seeds in the feeder but not in the toy box', () => {
    deliver('seed', 5, 1, 0); // into the toy box
    run(3);
    expect(toy('seed').placedIn).toBeNull();

    deliver('seed', 8, 1, 0); // into the feeder
    run(3);
    expect(toy('seed').placedIn).toBe('feeder');
  });

  it('does not count a block in the feeder', () => {
    deliver('block', 8, 1, 0);
    run(3);
    expect(toy('block').placedIn).toBeNull();
    expect(count('place')).toBe(0);
  });

  it('counts a block set down on a turned shelf', () => {
    deliver('block', 0, 1.4, 6);
    run(3);
    expect(toy('block').placedIn).toBe('shelf');
    expect(toy('block').position.y).toBeGreaterThan(1.04);
  });
});

describe('ring course', () => {
  it('counts a ring when the head flies through it, either way', () => {
    park(-5, 4, 2);
    run(0.05);
    park(-5, 4.5, -2); // through ring-a, off centre but inside
    run(0.05);
    expect(applied).toContainEqual({ type: 'passRing', ringId: 'ring-a', playerId: nova.id });
    expect(world.rings.get('ring-a')!.passed).toBe(true);
  });

  it('does not count a pass outside the hoop', () => {
    park(-5 + 2, 4, 2);
    run(0.05);
    park(-5 + 2, 4, -2);
    run(0.05);
    expect(count('passRing')).toBe(0);
  });

  it('celebrates when every ring is flown, then starts again', () => {
    park(-5, 4, 2);
    run(0.05);
    park(-5, 4, -2);
    run(0.05);
    park(-7, 5, 0.2); // ring-b faces along x
    run(0.05);
    park(-11, 5, 0.2);
    run(0.05);
    expect(count('passRing')).toBe(2);
    expect(applied).toContainEqual({ type: 'celebrate', what: 'rings' });
    expect([...world.rings.values()].every((r) => !r.passed)).toBe(true);
  });
});

describe('bells', () => {
  it('celebrates when every bell has been rung', () => {
    const beakTo = (x: number, y: number, z: number): void =>
      park(x - BEAK_OFFSET.x, y - BEAK_OFFSET.y, z - BEAK_OFFSET.z);
    beakTo(0, 2, 3.1);
    run(0.05);
    expect(count('celebrate')).toBe(0);
    beakTo(2, 2, 3.1);
    run(0.05);
    expect(count('ring')).toBe(2);
    expect(applied).toContainEqual({ type: 'celebrate', what: 'bells' });
    expect(world.bellsRung.size).toBe(0);
  });
});

describe('bird bath', () => {
  it('splashes once when the parrot lands in the water', () => {
    park(-5, 3, -8);
    run(0.05);
    expect(count('splash')).toBe(0);
    // Standing in the pond: the body's underside is at the water.
    park(-5, cfg.bodyHeight.value + 0.03, -8);
    run(0.3);
    expect(count('splash')).toBe(1);
  });
});

describe('stray toys', () => {
  it('go home after lying untouched and unplaced for a few minutes', () => {
    deliver('block', 15, 1, 15);
    run(5);
    expect(toy('block').position.distanceTo(toy('block').home)).toBeGreaterThan(10);
    run(180);
    expect(toy('block').position.distanceTo(toy('block').home)).toBeLessThan(0.05);
  });

  it('stay where they were placed', () => {
    deliver('block', 5, 1, 0);
    run(190);
    expect(toy('block').placedIn).toBe('toy-box');
  });
});
