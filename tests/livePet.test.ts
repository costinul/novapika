import { Vector3 } from 'three';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { founders } from '../shared/founders';
import { FeatherBatch } from '../src/characters/FeatherBatch';
import { petCharacter } from '../src/characters/pets';
import { PhysicsWorld } from '../src/engine/physics';
import { CONTENT, NEST_Y, PET_CORNER, SPAWN } from '../src/lobbies/aviary/layout';
import { buildScenery } from '../src/lobbies/aviary/scenery';
import { StaticBuilder } from '../src/lobbies/build';
import { LivePet } from '../src/pets/LivePet';
import { Player } from '../src/player/Player';
import { WorldState } from '../src/world/WorldState';

const STEP = 1 / 60;
const BODY = 0.6; // m from a parrot's eyes down to its feet

let physics: PhysicsWorld;
beforeAll(async () => {
  physics = await PhysicsWorld.create();
});

/** A player standing at a point, looking along -Z, hands by their sides. */
function standingAt(x: number, y: number, z: number): Player {
  const owner = new Player('owner', 'nova');
  moveTo(owner, x, y, z);
  return owner;
}
function moveTo(owner: Player, x: number, y: number, z: number): void {
  owner.head.position.set(x, y + BODY, z);
  owner.hands.left.grip.position.set(x - 0.2, y + 0.3, z);
  owner.hands.right.grip.position.set(x + 0.2, y + 0.3, z);
}
const flat = (a: Vector3, b: Vector3): number => Math.hypot(a.x - b.x, a.z - b.z);

describe('a pet that is out of the pet corner', () => {
  const perch = new Vector3(0, 0, 0);
  let pet: LivePet;
  let owner: Player;

  /** Run until `done`, or for `seconds`. Returns how long it took. */
  const run = (seconds: number, done: () => boolean = () => false): number => {
    let t = 0;
    for (; t < seconds && !done(); t += STEP) pet.step(STEP, owner);
    return t;
  };
  const resting = (): boolean => !pet.flying && pet.player.grounded;

  beforeEach(() => {
    physics.clear();
    physics.addStaticBox([0, -0.5, 0], [200, 0.5, 200]);
    physics.step(STEP); // lets the physics world take in what was just built
    pet = new LivePet('pet-1', petCharacter('pet-1', founders.pip.dna), perch, physics, null, () => []);
    owner = standingAt(1, 0, 1);
    run(2);
  });

  it('is an ordinary parrot to the movement rules, but not a person', () => {
    expect(pet.player.human).toBe(false);
    expect(pet.player.flapCost).toBeLessThan(1);
    expect(pet.mode).toBe('follow');
  });

  it('is flown at its own small size, so it fits where it looks as if it should', () => {
    const feathers = new FeatherBatch();
    const dna = { ...founders.pip.dna, size: 1 };
    const small = new LivePet('pet-2', petCharacter('pet-2', dna), perch, physics, feathers, () => []);
    for (let t = 0; t < 1; t += STEP) small.step(STEP, owner);
    feathers.begin();
    small.frame(STEP, 1);
    feathers.end();

    // 40% of a parrot: its head that much above its feet, its folded wings that close in.
    const { input, reachScale } = small.player;
    expect(reachScale).toBeCloseTo(0.4);
    expect(input.head.position.y).toBeCloseTo(0.6 * 0.4, 5);
    for (const hand of [input.hands.left, input.hands.right]) {
      expect(Math.abs(hand.grip.position.x)).toBeLessThan(0.14 * 0.4 + 0.001);
      expect(hand.grip.position.y).toBeLessThan(0.6 * 0.4);
    }
    // And it stands on the floor, not above or in it.
    expect(small.position.y).toBeGreaterThan(-0.01);
    expect(small.position.y).toBeLessThan(0.03);
    // The second thing in its view is its head.
    expect(small.view!.object.children[1].position.y - small.position.y).toBeCloseTo(0.24, 2);
    expect(feathers.mesh.count).toBe(14);
  });

  it('stays put while its owner is close', () => {
    run(6);
    expect(pet.flying).toBe(false);
    expect(pet.position.distanceTo(perch)).toBeLessThan(0.5);
  });

  it('flies to its owner when they go away, and lands to one side of them', () => {
    moveTo(owner, 14, 0, -6);
    run(3);
    expect(pet.flying).toBe(true);
    const took = run(40, resting);
    expect(took).toBeLessThan(40);
    // On the ground beside the owner, a little ahead, and not in their face.
    expect(pet.position.y).toBeLessThan(0.2);
    expect(flat(pet.position, owner.head.position)).toBeLessThan(2.8);
    expect(flat(pet.position, owner.head.position)).toBeGreaterThan(0.6);
    // Then it rests there.
    run(4);
    expect(pet.flying).toBe(false);
  });

  it('says when it has landed by its owner', () => {
    moveTo(owner, -12, 0, 8);
    let calls = 0;
    for (let t = 0; t < 40; t += STEP) {
      pet.step(STEP, owner);
      if (pet.arrived) calls++;
    }
    expect(calls).toBe(1);
  });

  it('keeps after an owner who keeps moving', () => {
    // The owner walks off in a line for a while, then stops.
    for (let t = 0; t < 12; t += STEP) {
      moveTo(owner, 1 + t * 1.5, 0, 1);
      pet.step(STEP, owner);
    }
    run(40, resting);
    expect(flat(pet.position, owner.head.position)).toBeLessThan(2.8);
  });

  it('is put down beside an owner it cannot catch', () => {
    // The owner jumps about faster than any parrot flies.
    for (let t = 0, hop = 0; t < 30; t += STEP) {
      if (Math.floor(t / 2) !== hop) {
        hop = Math.floor(t / 2);
        moveTo(owner, hop % 2 ? 80 : -80, 0, hop * 7 - 50);
      }
      pet.step(STEP, owner);
    }
    run(40, resting);
    expect(flat(pet.position, owner.head.position)).toBeLessThan(2.8);
  });

  it('lands on a perch near an owner who is high up with nothing beside them', () => {
    physics.addStaticBox([30, 9.5, 0], [0.6, 0.5, 0.6]); // a small platform, top at 10 m
    physics.step(STEP);
    const spot = new Vector3(30, 10, 0);
    pet = new LivePet('pet-1', petCharacter('pet-1', founders.pip.dna), perch, physics, null, () => [spot]);
    moveTo(owner, 33, 11, 0); // in the air, 3 m from the platform
    run(60, () => resting() && pet.position.y > 5);
    expect(pet.position.distanceTo(spot)).toBeLessThan(1.3);
  });

  it('flies home to its perch when sent, and says when it is there', () => {
    moveTo(owner, 12, 0, 5);
    run(3);
    run(40, resting);
    expect(pet.position.distanceTo(perch)).toBeGreaterThan(8);

    pet.mode = 'home';
    const took = run(30, () => pet.atHome);
    expect(pet.atHome).toBe(true);
    expect(took).toBeLessThan(16);
    expect(pet.position.distanceTo(perch)).toBeLessThan(1.3);
  });

  it('counts as home at once when sent home from its perch', () => {
    pet.mode = 'home';
    run(1.5);
    expect(pet.atHome).toBe(true);
  });
});

describe('a pet in the nest of the Aviary', () => {
  /** A pet on each perch of the rail in turn, with its owner somewhere in the nest. */
  function fromEachPerch(ownerAt: (perch: Vector3) => Vector3): { arrived: number; lowest: number; slowest: number } {
    let arrived = 0;
    let lowest = Infinity;
    let slowest = 0;
    for (const stand of PET_CORNER.perches) {
      const perch = new Vector3(...stand.position);
      const pet = new LivePet('pet-1', petCharacter('pet-1', founders.pip.dna), perch, physics, null, () => []);
      const at = ownerAt(perch);
      const owner = standingAt(at.x, NEST_Y, at.z);
      let t = 0;
      for (; t < 24; t += STEP) {
        pet.step(STEP, owner);
        lowest = Math.min(lowest, pet.position.y);
        if (t > 1.5 && !pet.flying && pet.player.grounded) break;
      }
      if (t < 24 && flat(pet.position, owner.head.position) < 2.8) arrived++;
      slowest = Math.max(slowest, t);
    }
    return { arrived, lowest, slowest };
  }

  beforeEach(() => {
    physics.clear();
    buildScenery(new StaticBuilder(physics));
    physics.step(STEP);
  });

  it('hops down beside an owner standing at the rail', () => {
    // The owner stands a parrot's reach in from the pet they touched.
    const { arrived, lowest } = fromEachPerch((perch) => perch.clone().multiplyScalar(1.8 / Math.hypot(perch.x, perch.z)));
    expect(arrived).toBe(6);
    expect(lowest).toBeGreaterThan(NEST_Y - 0.3); // never out of the nest
  });

  it('finds its way round the trunk to an owner on the far side of the nest', () => {
    const { arrived, lowest, slowest } = fromEachPerch(() => new Vector3(...SPAWN));
    expect(arrived).toBe(6);
    expect(lowest).toBeGreaterThan(NEST_Y - 0.3);
    expect(slowest).toBeLessThan(20);
  });

  it('never lands in the egg cup, which is where "beside the owner" falls from the spawn point', () => {
    // The cup is a place for toys, so it is the world that builds it.
    const world = new WorldState(physics);
    world.load(CONTENT);
    physics.step(STEP);
    const cup = new Vector3(...PET_CORNER.eggCup.position);
    const owner = standingAt(SPAWN[0], NEST_Y, SPAWN[2]);
    for (const stand of PET_CORNER.perches) {
      const perch = new Vector3(...stand.position);
      for (const start of [perch, 'beside'] as const) {
        const pet = new LivePet('pet-1', petCharacter('pet-1', founders.pip.dna), perch, physics, null, () => [], start);
        for (let t = 0; t < 12; t += STEP) pet.step(STEP, owner);
        expect(flat(pet.position, cup)).toBeGreaterThan(0.3);
        expect(flat(pet.position, owner.head.position)).toBeLessThan(2.8);
        expect(pet.position.y).toBeGreaterThan(NEST_Y - 0.1);
      }
    }
  });

  it('starts beside its owner when it was following already', () => {
    const perch = new Vector3(...PET_CORNER.perches[0].position);
    const pet = new LivePet('pet-1', petCharacter('pet-1', founders.pip.dna), perch, physics, null, () => [], 'beside');
    const owner = standingAt(SPAWN[0], NEST_Y, SPAWN[2]);
    expect(pet.position.distanceTo(perch)).toBeLessThan(0.6);
    pet.step(STEP, owner);
    expect(flat(pet.position, owner.head.position)).toBeLessThan(2);
    expect(pet.position.y).toBeGreaterThan(NEST_Y - 0.1);
    // And it stays there.
    for (let t = 0; t < 5; t += STEP) pet.step(STEP, owner);
    expect(pet.flying).toBe(false);
    expect(pet.position.y).toBeGreaterThan(NEST_Y - 0.1);
  });
});
