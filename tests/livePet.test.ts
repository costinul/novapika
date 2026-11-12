import { Vector3 } from 'three';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PetView, PlayerView } from '../shared/api';
import { founders } from '../shared/founders';
import { petCharacter } from '../src/characters/pets';
import { PhysicsWorld } from '../src/engine/physics';
import { NEST_Y, PET_CORNER, SPAWN } from '../src/lobbies/aviary/layout';
import { buildScenery } from '../src/lobbies/aviary/scenery';
import { StaticBuilder } from '../src/lobbies/build';
import { LivePet } from '../src/pets/LivePet';
import { Pets } from '../src/pets/Pets';
import type { PetEvent } from '../src/pets/Pets';
import { Player } from '../src/player/Player';

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

  it('starts beside its owner when it was following already', () => {
    const perch = new Vector3(...PET_CORNER.perches[0].position);
    const pet = new LivePet('pet-1', petCharacter('pet-1', founders.pip.dna), perch, physics, null, () => [], false);
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

describe('pets in the game', () => {
  const pip = (id: string): PetView => ({ id, dna: founders.pip.dna, stage: 'hatched' });
  const account = (followerId: string | null, ids = ['a', 'b', 'c']): { status: 'in'; player: PlayerView } => ({
    status: 'in',
    player: { id: 'p1', nickname: 'Alex', followerId, pets: ids.map(pip) },
  });
  const middle = (slot: number): Vector3 => new Vector3(...PET_CORNER.perches[slot].position).add(new Vector3(0, 0.15, 0));

  let pets: Pets;
  let owner: Player;
  let events: PetEvent['type'][];
  /** What the server will answer the next time it is asked. */
  let answer: (petId: string) => PlayerView | null;
  let asked: string[];

  /** Let the server's answer arrive. */
  const settle = async (): Promise<void> => {
    await Promise.resolve();
    await Promise.resolve();
  };
  const reach = (slot: number): void => {
    owner.hands.right.grip.position.copy(middle(slot));
    pets.frame(STEP, 1, owner);
  };
  const letGo = (): void => {
    moveTo(owner, 0, NEST_Y, 0);
    pets.frame(STEP, 1, owner);
  };

  beforeEach(() => {
    physics.clear();
    physics.addStaticBox([0, NEST_Y - 0.5, 0], [200, 0.5, 200]); // a floor at the height of the nest
    physics.step(STEP);
    events = [];
    asked = [];
    answer = (petId) => account(petId).player;
    pets = new Pets({
      physics,
      feathers: null,
      spots: () => [],
      onEvent: (event) => events.push(event.type),
      follow: async (petId) => {
        asked.push(petId);
        return answer(petId);
      },
    });
    owner = standingAt(0, NEST_Y, 0);
    pets.load(PET_CORNER);
  });

  it('has no pets about while nobody is signed in', () => {
    expect(pets.pets).toHaveLength(0);
    expect(pets.corner!.slots().every((slot) => slot === null)).toBe(true);
    reach(0);
    expect(asked).toEqual([]);
  });

  it('brings out the pet the server says follows the player', () => {
    pets.setAccount(account('b'));
    expect(pets.pets.map((p) => [p.petId, p.mode])).toEqual([['b', 'follow']]);
    // Its perch is empty while it is out.
    expect(pets.corner!.slots().map((p) => p?.id ?? null)).toEqual(['a', null, 'c', null, null, null]);
  });

  it('remembers who is signed in from before the lobby loaded', () => {
    pets.clear();
    pets.setAccount(account('a'));
    expect(pets.pets).toHaveLength(0);
    pets.load(PET_CORNER);
    expect(pets.pets.map((p) => p.petId)).toEqual(['a']);
  });

  it('asks the server when a pet is touched, and changes nothing until it agrees', async () => {
    pets.setAccount(account('a'));
    reach(2);
    expect(asked).toEqual(['c']);
    expect(pets.pets.map((p) => p.petId)).toEqual(['a']);
    expect(events).toEqual([]);

    await settle();
    // The new pet is out and following; the old one is on its way home.
    expect(pets.pets.map((p) => [p.petId, p.mode]).sort()).toEqual([
      ['a', 'home'],
      ['c', 'follow'],
    ]);
    expect(events).toEqual(['chosen']);
    expect(pets.corner!.slots().map((p) => p?.id ?? null)).toEqual([null, 'b', null, null, null, null]);
  });

  it('puts the old follower back on its perch when it gets home', async () => {
    pets.setAccount(account('a'));
    reach(2);
    await settle();
    letGo();
    for (let t = 0; t < 20 && pets.pets.length > 1; t += STEP) pets.step(STEP, owner);
    expect(pets.pets.map((p) => p.petId)).toEqual(['c']);
    expect(events).toContain('home');
    expect(pets.corner!.slots().map((p) => p?.id ?? null)).toEqual(['a', 'b', null, null, null, null]);
  });

  it('shakes its head and changes nothing when the server says no', async () => {
    pets.setAccount(account('a'));
    answer = () => null;
    reach(1);
    await settle();
    expect(asked).toEqual(['b']);
    expect(events).toEqual(['refused']);
    expect(pets.pets.map((p) => [p.petId, p.mode])).toEqual([['a', 'follow']]);
    expect(pets.corner!.slots().map((p) => p?.id ?? null)).toEqual([null, 'b', 'c', null, null, null]);
  });

  it('asks once for one touch, and not again while waiting for the answer', async () => {
    pets.setAccount(account('a'));
    reach(1);
    reach(1);
    reach(2);
    expect(asked).toEqual(['b']);
    await settle();
    letGo();
    reach(2);
    expect(asked).toEqual(['b', 'c']);
  });

  it('calls a pet back that was on its way home', async () => {
    pets.setAccount(account('a'));
    reach(1);
    await settle();
    letGo();
    // Before "a" is home, the server makes it the follower again.
    pets.setAccount(account('a'));
    expect(pets.pets.map((p) => [p.petId, p.mode]).sort()).toEqual([
      ['a', 'follow'],
      ['b', 'home'],
    ]);
  });

  it('turns the page when an arrow is touched', () => {
    pets.setAccount(account(null, ['a', 'b', 'c', 'd', 'e', 'f', 'g']));
    owner.hands.left.grip.position.set(...PET_CORNER.next.position);
    pets.frame(STEP, 1, owner);
    expect(pets.corner!.page).toBe(1);
    expect(asked).toEqual([]);
  });

  it('takes every pet away when the player signs out or the lobby is left', () => {
    pets.setAccount(account('a'));
    pets.setAccount({ status: 'out' });
    expect(pets.pets).toHaveLength(0);

    pets.setAccount(account('a'));
    pets.clear();
    expect(pets.pets).toHaveLength(0);
    expect(pets.corner).toBeNull();
  });

  it('takes away at once a follower the owner of the game has removed', () => {
    pets.setAccount(account('a'));
    pets.setAccount(account(null, ['b', 'c']));
    expect(pets.pets).toHaveLength(0);
    expect(pets.corner!.slots().map((p) => p?.id ?? null)).toEqual(['b', 'c', null, null, null, null]);
  });

  it('ignores an answer that arrives after the lobby has been left', async () => {
    pets.setAccount(account('a'));
    reach(1);
    pets.clear();
    await settle();
    expect(events).toEqual([]);
    expect(pets.pets).toHaveLength(0);
  });
});
