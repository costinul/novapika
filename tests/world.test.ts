import { Vector3 } from 'three';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PhysicsWorld } from '../src/engine/physics';
import { Player } from '../src/player/Player';
import { ActionLayer } from '../src/world/actions';
import type { Action } from '../src/world/actions';
import { BEAK_OFFSET, carryPosition } from '../src/world/beak';
import type { LobbyContent } from '../src/world/types';
import { WorldState } from '../src/world/WorldState';

// Toys, target places and bells, with real toy physics and no rendering.

const DT = 1 / 120;

const CONTENT: LobbyContent = {
  toyTypes: {
    block: { shape: 'box', size: 0.12, color: 0xffffff, density: 300, bounce: 0.2 },
    ball: { shape: 'ball', size: 0.14, color: 0xffffff, density: 200, bounce: 0.6, jingles: true },
  },
  toys: [
    { id: 'block-1', type: 'block', position: [0, 0.06, -1] },
    { id: 'block-2', type: 'block', position: [0.5, 0.06, -1] },
    { id: 'ball-1', type: 'ball', position: [-1, 0.07, -1] },
  ],
  targets: [{ id: 'toy-box', kind: 'toyBox', position: [5, 0, 0], size: [1, 0.35, 0.8], color: 0 }],
  peckables: [{ id: 'bell', kind: 'bell', position: [0, 2, 3], radius: 0.12, stringLength: 0.3 }],
};

let physics: PhysicsWorld;
let world: WorldState;
let actions: ActionLayer;
let applied: Action[];
let nova: Player;
let pika: Player;

beforeAll(async () => {
  physics = await PhysicsWorld.create();
});

beforeEach(() => {
  physics.clear();
  physics.addStaticBox([0, -0.5, 0], [50, 0.5, 50]);
  world = new WorldState(physics);
  nova = new Player('nova-player', 'nova');
  pika = new Player('pika-player', 'pika');
  world.players.set(nova.id, nova);
  world.players.set(pika.id, pika);
  world.load(CONTENT);
  actions = new ActionLayer(world);
  applied = [];
  actions.onApplied((a) => applied.push(a));
  // Park both players well away from everything.
  for (const p of [nova, pika]) {
    p.head.position.set(-20, 5, -20);
    p.hands.left.grip.position.set(-20.3, 5, -20);
    p.hands.right.grip.position.set(-19.7, 5, -20);
  }
});

function run(seconds: number): void {
  for (let t = 0; t < seconds; t += DT) {
    physics.step(DT);
    world.step(DT, actions);
    world.updateInteractions(actions);
  }
}

const toy = (id: string) => world.toys.get(id)!;
const count = (type: Action['type']): number => applied.filter((a) => a.type === type).length;

describe('bite and carry', () => {
  it('picks up a toy and carries it in front of the face', () => {
    expect(actions.dispatch({ type: 'pickUp', playerId: nova.id, toyId: 'block-1' })).toBe(true);
    expect(toy('block-1').holderId).toBe(nova.id);
    expect(nova.carriedItemId).toBe('block-1');

    nova.head.position.set(3, 4, 2);
    run(0.1);
    const expected = carryPosition(nova.head, new Vector3());
    expect(toy('block-1').position.distanceTo(expected)).toBeLessThan(1e-6);
    expect(expected.y).toBeLessThan(nova.head.position.y); // low, out of the view
  });

  it('carries only one toy at a time', () => {
    actions.dispatch({ type: 'pickUp', playerId: nova.id, toyId: 'block-1' });
    expect(actions.dispatch({ type: 'pickUp', playerId: nova.id, toyId: 'block-2' })).toBe(false);
    expect(nova.carriedItemId).toBe('block-1');
  });

  it('does not let a second player take a held toy', () => {
    actions.dispatch({ type: 'pickUp', playerId: nova.id, toyId: 'block-1' });
    expect(actions.dispatch({ type: 'pickUp', playerId: pika.id, toyId: 'block-1' })).toBe(false);
    expect(toy('block-1').holderId).toBe(nova.id);
  });

  it('rejects actions that make no sense', () => {
    expect(actions.dispatch({ type: 'drop', playerId: nova.id })).toBe(false);
    expect(actions.dispatch({ type: 'pickUp', playerId: nova.id, toyId: 'no-such-toy' })).toBe(false);
    expect(actions.dispatch({ type: 'pickUp', playerId: 'nobody', toyId: 'block-1' })).toBe(false);
    expect(applied).toHaveLength(0);
  });

  it('finds the nearest toy within reach of the beak, ignoring held ones', () => {
    const beak = new Vector3(0.1, 0.1, -1);
    expect(world.nearestBiteable(beak, 0.3)?.id).toBe('block-1');
    actions.dispatch({ type: 'pickUp', playerId: pika.id, toyId: 'block-1' });
    expect(world.nearestBiteable(beak, 0.3)).toBeNull();
    expect(world.nearestBiteable(beak, 0.5)?.id).toBe('block-2');
  });
});

describe('drop', () => {
  it('drops a toy in flight: it keeps the speed, falls and comes to rest', () => {
    actions.dispatch({ type: 'pickUp', playerId: nova.id, toyId: 'block-1' });
    nova.head.position.set(0, 6, 0);
    nova.velocity.set(4, 0, 0);
    run(0.05);

    expect(actions.dispatch({ type: 'drop', playerId: nova.id })).toBe(true);
    expect(nova.carriedItemId).toBeNull();
    expect(toy('block-1').holderId).toBeNull();

    run(0.3);
    expect(toy('block-1').position.x).toBeGreaterThan(0.8); // carried on forward
    expect(toy('block-1').position.y).toBeLessThan(5.8); // and is falling

    run(5);
    expect(toy('block-1').position.y).toBeCloseTo(0.06, 1);
  });

  it('brings a toy back to its start if it leaves the lobby', () => {
    actions.dispatch({ type: 'pickUp', playerId: nova.id, toyId: 'block-1' });
    nova.head.position.set(200, 3, 0); // out past the edge of the floor
    run(0.05);
    actions.dispatch({ type: 'drop', playerId: nova.id });
    run(3);
    expect(toy('block-1').position.distanceTo(toy('block-1').home)).toBeLessThan(0.05);
  });
});

describe('target places', () => {
  it('reports a toy dropped into the toy box as placed, once', () => {
    actions.dispatch({ type: 'pickUp', playerId: nova.id, toyId: 'block-1' });
    // Hover so the carried toy is over the middle of the box.
    nova.head.position.set(5, 1.2, 0.3);
    run(0.05);
    actions.dispatch({ type: 'drop', playerId: nova.id });
    run(3);

    expect(toy('block-1').placedIn).toBe('toy-box');
    expect(count('place')).toBe(1);
    expect(applied.find((a) => a.type === 'place')).toEqual({ type: 'place', toyId: 'block-1', targetId: 'toy-box' });

    // Taking it out again clears the placement.
    actions.dispatch({ type: 'pickUp', playerId: pika.id, toyId: 'block-1' });
    expect(toy('block-1').placedIn).toBeNull();
  });

  it('does not count a toy resting on the ground outside the box', () => {
    run(1);
    expect(count('place')).toBe(0);
  });
});

describe('peck', () => {
  /** Put the player's beak tip at a point (head level, facing -z). */
  const beakAt = (p: Player, x: number, y: number, z: number): void => {
    p.head.position.set(x - BEAK_OFFSET.x, y - BEAK_OFFSET.y, z - BEAK_OFFSET.z);
  };

  it('rings a bell once when the beak moves into it, with no button', () => {
    beakAt(nova, 0, 2, 3.5);
    run(0.1);
    expect(count('ring')).toBe(0);

    beakAt(nova, 0, 2, 3.1);
    run(0.3); // stays in contact
    expect(count('ring')).toBe(1);
    expect(applied[0]).toEqual({ type: 'ring', objectId: 'bell', playerId: nova.id });

    beakAt(nova, 0, 2, 3.5);
    run(0.1);
    beakAt(nova, 0, 2, 3.1);
    run(0.1);
    expect(count('ring')).toBe(2);
  });

  it('rings when a hand knocks it too', () => {
    nova.hands.right.grip.position.set(0.05, 2, 3);
    run(0.05);
    expect(count('ring')).toBe(1);
  });
});

describe('bell balls', () => {
  it('jingle when dropped', () => {
    let jingles = 0;
    world.onJingle = () => jingles++;
    actions.dispatch({ type: 'pickUp', playerId: nova.id, toyId: 'ball-1' });
    nova.head.position.set(0, 2, 0);
    run(0.05);
    actions.dispatch({ type: 'drop', playerId: nova.id });
    run(2);
    expect(jingles).toBeGreaterThan(0);
  });
});
