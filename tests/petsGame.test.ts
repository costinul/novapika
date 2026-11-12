import { Vector3 } from 'three';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import * as rules from '../server/rules';
import type { Deps } from '../server/rules';
import type { PlayerRow } from '../server/store';
import { PhysicsWorld } from '../src/engine/physics';
import { NEST_Y, PET_CORNER } from '../src/lobbies/aviary/layout';
import { HOLD_TO_FREE, Pets } from '../src/pets/Pets';
import type { PetEvent } from '../src/pets/Pets';
import { Player } from '../src/player/Player';
import type { Stand } from '../src/world/types';
import { fakeServer, testDeps } from './fakeServer';
import { MemoryStore } from './memoryStore';

// The game's side of pets, played against the real server rules kept in
// memory: every touch here goes through the same rules a real one would.

const STEP = 1 / 60;
const at = (stand: Stand, lift = 0): Vector3 => new Vector3(...stand.position).add(new Vector3(0, lift, 0));
const far = new Vector3(0, NEST_Y + 30, 0);
const { perches, hearts, board, mail, goodbye, eggCup } = PET_CORNER;

let physics: PhysicsWorld;
beforeAll(async () => {
  physics = await PhysicsWorld.create();
});

let store: MemoryStore;
let deps: Deps;
let alex: PlayerRow;
let sam: PlayerRow;
/** The ids of each player's pets, in the order they sit on the rail. */
let mine: string[];
let theirs: string[];
let server: ReturnType<typeof fakeServer>;
let pets: Pets;
let owner: Player;
let events: PetEvent['type'][];
let eaten: string[];

/** Let the server's answers arrive. */
const settle = async (): Promise<void> => {
  for (let i = 0; i < 3; i++) await new Promise((done) => setTimeout(done, 0));
};
/** Reach out and touch a point with the right hand, then take the hand away. */
const touch = async (point: Vector3): Promise<void> => {
  owner.hands.right.grip.position.copy(point);
  pets.frame(STEP, 1, owner);
  await settle();
  owner.hands.right.grip.position.copy(far);
  pets.frame(STEP, 1, owner);
};
const fly = (seconds: number): void => {
  for (let t = 0; t < seconds; t += STEP) pets.step(STEP, owner);
};
const out = (): [string, string][] => pets.pets.map((pet): [string, string] => [pet.petId, pet.leaving ? 'leaving' : pet.mode]).sort();
const rail = (): (string | null)[] => pets.corner!.slots().map((pet) => pet?.id ?? null);
const view = () => rules.playerView(store, alex.id);

async function playerWith(name: string, founderIds: string[]): Promise<{ player: PlayerRow; ids: string[] }> {
  const { player } = await rules.createPlayer(store, deps, name);
  for (const id of founderIds) await rules.givePet(store, deps, player.id, id);
  return { player, ids: (await rules.playerView(store, player.id)).pets.map((pet) => pet.id) };
}

beforeEach(async () => {
  physics.clear();
  physics.addStaticBox([0, NEST_Y - 0.5, 0], [200, 0.5, 200]); // a floor at the height of the nest
  physics.step(STEP);

  store = new MemoryStore();
  deps = testDeps();
  ({ player: alex, ids: mine } = await playerWith('Alex', ['ember', 'tango']));
  ({ player: sam, ids: theirs } = await playerWith('Sam', ['prism']));
  server = fakeServer(store, deps, alex.id);
  events = [];
  eaten = [];
  pets = new Pets({
    physics,
    feathers: null,
    api: server,
    spots: () => [],
    eat: (toyId) => eaten.push(toyId),
    onEvent: (event) => events.push(event.type),
  });
  pets.load(PET_CORNER);
  pets.setAccount(await server.account());

  owner = new Player('owner', 'nova');
  owner.head.position.set(0, NEST_Y + 0.6, 0);
  owner.hands.left.grip.position.copy(far);
  owner.hands.right.grip.position.copy(far);
  // The first frame asks the server about friends.
  pets.frame(STEP, 1, owner);
  await settle();
  server.calls.length = 0;
});

describe('starting out', () => {
  it('has the follower out, the rest on the rail, and the friends on the board', () => {
    expect(out()).toEqual([[mine[0], 'follow']]);
    expect(rail()).toEqual([null, mine[1], mine[2], null, null, null]);
    expect(pets.corner!.friendShowing()!.friend.nickname).toBe('Sam');
    expect(pets.corner!.friendShowing()!.pets.map((pet) => pet.id)).toEqual(theirs);
  });

  it('has nothing about while nobody is signed in', async () => {
    pets.setAccount({ status: 'out' });
    expect(pets.pets).toHaveLength(0);
    expect(rail().every((slot) => slot === null)).toBe(true);
    await touch(at(perches[1], 0.15));
    await touch(at(hearts[0], 0.15));
    expect(server.calls).toEqual([]);
  });

  it('says so when the server no longer takes the sign-in', async () => {
    let signedOut = 0;
    pets = new Pets({ physics, feathers: null, api: server, spots: () => [], eat: () => {}, onSignedOut: () => signedOut++ });
    pets.load(PET_CORNER);
    pets.setAccount(await server.account());
    pets.frame(STEP, 1, owner);
    await settle();
    expect(signedOut).toBe(0);

    server.account = async () => ({ status: 'out' });
    pets.frame(25, 1, owner);
    await settle();
    expect(signedOut).toBe(1);
    expect(pets.pets).toHaveLength(0);
  });

  it('remembers who is signed in from before the lobby loaded', async () => {
    const account = await server.account();
    pets.clear();
    pets.setAccount(account);
    expect(pets.pets).toHaveLength(0);
    pets.load(PET_CORNER);
    expect(out()).toEqual([[mine[0], 'follow']]);
  });
});

describe('choosing a follower', () => {
  it('asks the server, and brings the new pet out and sends the old one home', async () => {
    await touch(at(perches[2], 0.15));
    expect(server.calls).toEqual(['follow']);
    expect((await view()).followerId).toBe(mine[2]);
    expect(out()).toEqual([[mine[0], 'home'], [mine[2], 'follow']].sort());
    expect(events).toEqual(['chosen']);

    fly(12);
    expect(out()).toEqual([[mine[2], 'follow']]);
    expect(events).toContain('home');
    expect(rail()).toEqual([mine[0], mine[1], null, null, null, null]);
  });

  it('changes nothing when the server cannot be reached', async () => {
    server.down = true;
    await touch(at(perches[1], 0.15));
    expect(events).toEqual(['refused']);
    expect(out()).toEqual([[mine[0], 'follow']]);
    expect(rail()).toEqual([null, mine[1], mine[2], null, null, null]);
  });

  it('asks once for one touch, and not again while waiting for the answer', async () => {
    owner.hands.right.grip.position.copy(at(perches[1], 0.15));
    pets.frame(STEP, 1, owner);
    pets.frame(STEP, 1, owner);
    owner.hands.right.grip.position.copy(at(perches[2], 0.15));
    pets.frame(STEP, 1, owner);
    expect(server.calls).toEqual(['follow']);
    await settle();
  });

  it('ignores an answer that arrives after the lobby has been left', async () => {
    owner.hands.right.grip.position.copy(at(perches[1], 0.15));
    pets.frame(STEP, 1, owner);
    pets.clear();
    await settle();
    expect(events).toEqual([]);
    expect(pets.pets).toHaveLength(0);
  });
});

describe('breeding two of your own pets', () => {
  it('lays an egg once a pet sits on each heart perch', async () => {
    // The follower lands on the first perch. That is only in the game so far.
    await touch(at(hearts[0], 0.15));
    expect(pets.corner!.placed.hearts).toEqual([mine[0], null]);
    expect(out()).toEqual([]);
    expect(server.calls).toEqual([]);

    // Another pet is chosen, and lands on the second.
    await touch(at(perches[1], 0.15));
    expect(out()).toEqual([[mine[1], 'follow']]);
    await touch(at(hearts[1], 0.15));

    expect(server.calls).toEqual(['follow', 'breed']);
    const now = await view();
    expect(now.egg).not.toBeNull();
    expect(pets.corner!.egg).toEqual(now.egg);
    // Both parents leave the perches: one follows again, the other flies home.
    expect(pets.corner!.placed.hearts).toEqual([null, null]);
    expect(out()).toEqual([[mine[0], 'home'], [mine[1], 'follow']].sort());
    expect(events.filter((event) => event === 'cheer')).toHaveLength(1);
  });

  it('will not take a pet while there is an egg, or with no follower to land', async () => {
    await touch(at(hearts[0], 0.15));
    await touch(at(perches[1], 0.15));
    await touch(at(hearts[1], 0.15));
    events.length = 0;

    await touch(at(hearts[0], 0.15));
    expect(events).toEqual(['refused']);
    expect(pets.corner!.placed.hearts).toEqual([null, null]);
  });

  it('refuses a heart perch when no pet is following', async () => {
    await rules.removePet(store, mine[0]);
    pets.setAccount(await server.account());
    expect(out()).toEqual([]);
    await touch(at(hearts[0], 0.15));
    expect(events).toEqual(['refused']);
  });

  it('lets a pet be taken off its perch again by touching it', async () => {
    await touch(at(hearts[0], 0.15));
    await touch(at(hearts[0], 0.15));
    expect(pets.corner!.placed.hearts).toEqual([null, null]);
    expect(out()).toEqual([[mine[0], 'follow']]);
    expect(server.calls).toEqual([]);
  });

  it('puts the second pet back if the server will not have the egg', async () => {
    await touch(at(hearts[0], 0.15));
    await touch(at(perches[1], 0.15));
    server.down = true;
    await touch(at(hearts[1], 0.15));
    expect(events.at(-1)).toBe('refused');
    expect(pets.corner!.placed.hearts).toEqual([mine[0], null]);
    expect(out()).toEqual([[mine[1], 'follow']]);
    expect(pets.corner!.egg).toBeNull();
  });
});

describe('asking a friend for DNA', () => {
  const friendPet = (): Vector3 => at(board.places[0], 0.1);

  it('needs one of the player\'s own pets waiting on a heart perch', async () => {
    await touch(friendPet());
    expect(events).toEqual(['refused']);
    expect(server.calls).toEqual([]);
  });

  it('shows the friend\'s pet on the other perch while the answer is awaited', async () => {
    await touch(at(hearts[1], 0.15));
    await touch(friendPet());
    expect(server.calls).toEqual(['ask']);
    expect(store.requestRows.size).toBe(1);
    const [left, right] = pets.corner!.heartSlots();
    expect(left).toEqual({ kind: 'theirs', pet: expect.objectContaining({ id: theirs[0] }) });
    expect(right.kind).toBe('mine');
    expect(events).toEqual(['cheer']);
    // While waiting, no other friend's pet can be asked for.
    events.length = 0;
    await touch(at(board.places[1], 0.1));
    expect(events).toEqual(['refused']);
  });

  it('takes the request back when the friend\'s pet is touched, leaving the player\'s own in place', async () => {
    await touch(at(hearts[0], 0.15));
    await touch(friendPet());
    await touch(at(hearts[1], 0.15));
    expect(server.calls).toEqual(['ask', 'cancel']);
    expect(store.requestRows.size).toBe(0);
    expect(pets.corner!.asking).toBeNull();
    expect(pets.corner!.placed.hearts).toEqual([mine[0], null]);
  });

  it('takes the request back, and the pet off its perch, when the player\'s own pet is touched', async () => {
    await touch(at(hearts[0], 0.15));
    await touch(friendPet());
    await touch(at(hearts[0], 0.15));
    expect(store.requestRows.size).toBe(0);
    expect(pets.corner!.placed.hearts).toEqual([null, null]);
    expect(out()).toEqual([[mine[0], 'follow']]);
  });

  it('finds the egg the next time it asks the server, after the friend has said yes', async () => {
    await touch(at(hearts[0], 0.15));
    await touch(friendPet());
    const request = [...store.requestRows.values()][0];
    await rules.answer(store, deps, sam, request.id, true);

    // Nothing shows until the game next hears from the server.
    expect(pets.corner!.egg).toBeNull();
    pets.frame(25, 1, owner);
    await settle();
    expect(pets.corner!.egg).not.toBeNull();
    expect(pets.corner!.asking).toBeNull();
    expect(pets.corner!.placed.hearts).toEqual([null, null]);
    expect(out()).toEqual([[mine[0], 'follow']]);
  });

  it('frees the perch again after the friend has said no', async () => {
    await touch(at(hearts[0], 0.15));
    await touch(friendPet());
    await rules.answer(store, deps, sam, [...store.requestRows.values()][0].id, false);
    pets.frame(25, 1, owner);
    await settle();
    expect(pets.corner!.asking).toBeNull();
    expect(pets.corner!.egg).toBeNull();
    expect(pets.corner!.heartSlots()).toEqual([expect.objectContaining({ kind: 'mine' }), { kind: 'empty' }]);
  });

  it('puts the pet and the friend\'s pet back on the perches when the game starts again', async () => {
    await touch(at(hearts[1], 0.15));
    await touch(friendPet());
    // A new game: nothing is remembered but what the server has.
    pets.clear();
    pets.load(PET_CORNER);
    expect(pets.corner!.placed.hearts).toEqual([mine[0], null]);
    expect(pets.corner!.heartSlots()[1]).toEqual({ kind: 'theirs', pet: expect.objectContaining({ id: theirs[0] }) });
    expect(out()).toEqual([]);
  });
});

describe('answering a friend', () => {
  beforeEach(async () => {
    await rules.askFor(store, deps, sam, theirs[0], mine[1]);
    pets.setAccount(await server.account());
  });

  it('shows the request, and lays the egg in the friend\'s nest on a yes', async () => {
    expect(pets.corner!.mail).toEqual(expect.objectContaining({ myPetId: mine[1], friend: 'Sam' }));
    await touch(at(mail.yes));
    expect(server.calls).toEqual(['answer']);
    expect((await rules.playerView(store, sam.id)).egg).not.toBeNull();
    expect(pets.corner!.mail).toBeNull();
    // Giving costs nothing.
    expect((await view()).pets.map((pet) => pet.id)).toEqual(mine);
    expect(events).toEqual(['cheer']);
  });

  it('lays nothing on a no', async () => {
    await touch(at(mail.no));
    expect((await rules.playerView(store, sam.id)).egg).toBeNull();
    expect(pets.corner!.mail).toBeNull();
    expect(store.requestRows.size).toBe(0);
  });
});

describe('the egg', () => {
  beforeEach(async () => {
    await rules.breedOwn(store, deps, alex, mine[1], mine[2]);
    pets.setAccount(await server.account());
  });

  it('eats food dropped in the cup, and hatches on the third seed', async () => {
    pets.onPlaced('seed-1', eggCup.targetId);
    await settle();
    expect(eaten).toEqual(['seed-1']);
    expect(pets.corner!.egg!.seeds).toBe(1);

    pets.onPlaced('millet-1', eggCup.targetId);
    await settle();
    expect(pets.corner!.egg!.seeds).toBe(2);
    expect(pets.corner!.pets).toHaveLength(3);

    pets.onPlaced('seed-2', eggCup.targetId);
    await settle();
    expect(pets.corner!.egg).toBeNull();
    expect(pets.corner!.pets).toHaveLength(4);
    expect(events).toEqual(['cheer', 'cheer', 'cheer']);

    // The baby flies from the cup to its place on the rail, and then sits there.
    const baby = pets.corner!.pets[3].id;
    expect(out()).toEqual([[baby, 'home'], [mine[0], 'follow']].sort());
    expect(rail()[3]).toBeNull();
    fly(12);
    expect(out()).toEqual([[mine[0], 'follow']]);
    expect(rail()[3]).toBe(baby);
  });

  it('takes one seed at a time, however fast they land', async () => {
    pets.onPlaced('seed-1', eggCup.targetId);
    pets.onPlaced('seed-2', eggCup.targetId);
    await settle();
    expect(eaten).toEqual(['seed-1', 'seed-2']);
    expect(server.calls).toEqual(['feed']);
    expect(pets.corner!.egg!.seeds).toBe(1);
  });

  it('leaves food put anywhere else alone', async () => {
    pets.onPlaced('seed-1', 'feeder');
    await settle();
    expect(eaten).toEqual([]);
    expect(server.calls).toEqual([]);
  });

  it('eats food dropped in an empty cup, to no effect', async () => {
    await rules.removePet(store, (await view()).egg!.id);
    pets.setAccount(await server.account());
    pets.onPlaced('seed-1', eggCup.targetId);
    await settle();
    expect(eaten).toEqual(['seed-1']);
    expect(server.calls).toEqual([]);
  });
});

describe('setting a pet free', () => {
  const perch = (): Vector3 => at(goodbye.perch, 0.15);
  /** Rest a hand on each pad for a while. */
  const hold = async (seconds: number): Promise<void> => {
    owner.hands.left.grip.position.copy(at(goodbye.pads[0]));
    owner.hands.right.grip.position.copy(at(goodbye.pads[1]));
    for (let t = 0; t < seconds; t += STEP) pets.frame(STEP, 1, owner);
    await settle();
  };
  const letGo = (): void => {
    owner.hands.left.grip.position.copy(far);
    owner.hands.right.grip.position.copy(far);
    pets.frame(STEP, 1, owner);
  };

  it('takes three steps: the follower, the goodbye perch, and both pads held for three seconds', async () => {
    expect(HOLD_TO_FREE).toBe(3);
    await touch(perch());
    expect(pets.corner!.placed.goodbye).toBe(mine[0]);
    expect(out()).toEqual([]);
    expect(server.calls).toEqual([]);

    await hold(2.5);
    expect(pets.corner!.held).toBeGreaterThan(0.7);
    expect(server.calls).toEqual([]);
    await hold(0.7);

    expect(server.calls).toEqual(['free']);
    expect(store.petRows.get(mine[0])!.stage).toBe('freed');
    expect(pets.corner!.pets.map((pet) => pet.id)).toEqual([mine[1], mine[2]]);
    expect(pets.corner!.placed.goodbye).toBeNull();
    expect(events).toEqual(['cheer']);
    // It is seen flying off, and then it is gone.
    expect(out()).toEqual([[mine[0], 'leaving']]);
    fly(8);
    expect(out()).toEqual([]);
    expect(rail()).toEqual([mine[1], mine[2], null, null, null, null]);
  });

  it('does nothing if the pads are let go of too soon, or only one is held', async () => {
    await touch(perch());
    await hold(2.8);
    letGo();
    expect(pets.corner!.held).toBe(0);
    await hold(2.8);
    letGo();

    owner.hands.left.grip.position.copy(at(goodbye.pads[0]));
    for (let t = 0; t < 5; t += STEP) pets.frame(STEP, 1, owner);
    await settle();

    expect(server.calls).toEqual([]);
    expect(pets.corner!.placed.goodbye).toBe(mine[0]);
    expect(store.petRows.get(mine[0])!.stage).toBe('hatched');
  });

  it('does nothing when the pads are held with no pet on the perch', async () => {
    await hold(5);
    expect(server.calls).toEqual([]);
    expect(pets.corner!.held).toBe(0);
  });

  it('lets the pet off the perch again by touching it', async () => {
    await touch(perch());
    await touch(perch());
    expect(pets.corner!.placed.goodbye).toBeNull();
    expect(out()).toEqual([[mine[0], 'follow']]);
  });

  it('refuses the perch when no pet is following', async () => {
    await touch(perch());
    events.length = 0;
    await touch(perch());
    await rules.removePet(store, mine[0]);
    pets.setAccount(await server.account());
    await touch(perch());
    expect(events).toEqual(['refused']);
  });

  it('keeps a player\'s last pet, whatever is held', async () => {
    await rules.removePet(store, mine[1]);
    await rules.removePet(store, mine[2]);
    pets.setAccount(await server.account());
    await touch(perch());
    await hold(3.2);
    expect(server.calls).toEqual(['free']);
    expect(events).toEqual(['refused']);
    expect(store.petRows.get(mine[0])!.stage).toBe('hatched');
    expect(pets.corner!.placed.goodbye).toBe(mine[0]);
    expect(pets.corner!.held).toBe(0);
  });
});

describe('a place with no pet corner', () => {
  /** Leave the place with the pet corner for one without, as going through the gate does. */
  const travel = (): void => {
    pets.clear();
    pets.load(undefined, [0, NEST_Y, 0]);
  };

  it('has the follower come along, and nothing else', () => {
    travel();
    expect(pets.corner).toBeNull();
    expect(out()).toEqual([[mine[0], 'follow']]);
    expect(pets.follower!.petId).toBe(mine[0]);
  });

  it('has the follower stay by its owner', () => {
    travel();
    owner.position.set(6, NEST_Y, 4);
    owner.head.position.set(6, NEST_Y + 0.6, 4);
    fly(4);
    expect(pets.follower!.player.position.distanceTo(owner.position)).toBeLessThan(3);
  });

  it('has nothing about while nobody is signed in', () => {
    travel();
    pets.setAccount({ status: 'out' });
    expect(pets.pets).toHaveLength(0);
  });

  it('takes whichever pet the server says follows', async () => {
    travel();
    await rules.chooseFollower(store, alex, mine[1]);
    pets.setAccount(await server.account());
    expect(out()).toEqual([[mine[1], 'follow']]);
  });

  it("still knows what the friends' pets look like, to draw the ones that follow them", async () => {
    expect(pets.friendPet(sam.id, theirs[0])?.id).toBe(theirs[0]);
    travel();
    expect(pets.friendPet(sam.id, theirs[0])?.id).toBe(theirs[0]);

    // And when the game starts in such a place, it asks.
    pets = new Pets({ physics, feathers: null, api: server, spots: () => [], eat: () => {} });
    pets.load(undefined, [0, NEST_Y, 0]);
    pets.setAccount(await server.account());
    expect(pets.friendPet(sam.id, theirs[0])).toBeNull();
    pets.frame(STEP, 1, owner);
    await settle();
    expect(pets.friendPet(sam.id, theirs[0])?.id).toBe(theirs[0]);
  });

  it('says so when the server no longer takes the sign-in', async () => {
    let signedOut = 0;
    pets = new Pets({ physics, feathers: null, api: server, spots: () => [], eat: () => {}, onSignedOut: () => signedOut++ });
    pets.load(undefined, [0, NEST_Y, 0]);
    pets.setAccount(await server.account());
    pets.frame(STEP, 1, owner);
    await settle();
    expect(signedOut).toBe(0);

    server.account = async () => ({ status: 'out' });
    pets.frame(25, 1, owner);
    await settle();
    expect(signedOut).toBe(1);
    expect(pets.pets).toHaveLength(0);
  });

  it('has the pets back on the rail, and the friends on the board, on coming home', () => {
    travel();
    pets.clear();
    pets.load(PET_CORNER);
    expect(out()).toEqual([[mine[0], 'follow']]);
    expect(rail()).toEqual([null, mine[1], mine[2], null, null, null]);
    expect(pets.corner!.friendShowing()!.friend.nickname).toBe('Sam');
  });
});
