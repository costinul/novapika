import { beforeEach, describe, expect, it } from 'vitest';
import {
  aboutPlayer,
  answer,
  askFor,
  breedOwn,
  cancelRequest,
  chooseFollower,
  createPlayer,
  feedEgg,
  forgetOldTalk,
  freePet,
  friendsOf,
  givePet,
  helperOn,
  keepTalk,
  login,
  openPresent,
  overview,
  playerForToken,
  playerView,
  Refusal,
  removePet,
  removePlayer,
  resetCode,
  restorePet,
  setHelperOn,
  sha256,
  talkView,
} from '../server/rules';
import type { Deps } from '../server/rules';
import type { PlayerRow } from '../server/store';
import { PET_CAP, SEEDS_TO_HATCH } from '../shared/api';
import { tierOf } from '../shared/dna';
import { founders } from '../shared/founders';
import { MemoryStore } from './memoryStore';

/** Fixed ids, times and tokens, and a random that repeats from run to run. */
function testDeps(seed = 1): Deps & { queue: number[] } {
  let n = 0;
  const queue: number[] = [];
  return {
    /** Numbers to hand out before the seeded ones, for forcing a result. */
    queue,
    now: () => 1_000_000 + ++n,
    id: () => `id-${++n}`,
    token: () => `token-${++n}`,
    random: () => {
      if (queue.length > 0) return queue.shift()!;
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}

/** Expect a call to be turned down for this reason. */
async function refused(call: Promise<unknown>, reason: string, status: number): Promise<void> {
  const error = await call.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(Refusal);
  expect((error as Refusal).reason).toBe(reason);
  expect((error as Refusal).status).toBe(status);
}

let store: MemoryStore;
let deps: ReturnType<typeof testDeps>;

beforeEach(() => {
  store = new MemoryStore();
  deps = testDeps();
});

describe('adding a player', () => {
  it('gives a 6-digit code and keeps only its hash', async () => {
    const { player, code } = await createPlayer(store, deps, '  Alex ');
    expect(code).toMatch(/^\d{6}$/);
    expect(player.nickname).toBe('Alex');
    const kept = store.playerRows.get(player.id)!;
    expect(kept.codeHash).toBe(await sha256(code));
    expect(JSON.stringify([...store.playerRows.values()])).not.toContain(code);
  });

  it('starts the player with one common pet, which follows them', async () => {
    for (let i = 0; i < 20; i++) {
      const { player } = await createPlayer(store, deps, `Player ${i}`);
      const view = await playerView(store, player.id);
      expect(view.pets).toHaveLength(1);
      expect(tierOf(view.pets[0].dna)).toBe('common');
      expect(view.followerId).toBe(view.pets[0].id);
    }
  });

  it('refuses a missing, empty or over-long nickname', async () => {
    await refused(createPlayer(store, deps, ''), 'bad-nickname', 400);
    await refused(createPlayer(store, deps, '   '), 'bad-nickname', 400);
    await refused(createPlayer(store, deps, 'x'.repeat(21)), 'bad-nickname', 400);
    await refused(createPlayer(store, deps, undefined), 'bad-nickname', 400);
    await refused(createPlayer(store, deps, 42), 'bad-nickname', 400);
    expect(store.playerRows.size).toBe(0);
  });

  it('never gives two players the same code', async () => {
    // The first six numbers make the code 123456, for both players.
    const digits = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6];
    deps.queue.push(...digits);
    const first = await createPlayer(store, deps, 'One');
    expect(first.code).toBe('123456');
    // The starter pet used some random numbers; line the same code up again.
    deps.queue.length = 0;
    deps.queue.push(...digits);
    const second = await createPlayer(store, deps, 'Two');
    expect(second.code).not.toBe('123456');
    expect(second.code).toMatch(/^\d{6}$/);
  });
});

describe('signing in', () => {
  it('swaps the right code for a token that finds the player', async () => {
    const { player, code } = await createPlayer(store, deps, 'Alex');
    const { token, player: signedIn } = await login(store, deps, code);
    expect(signedIn.id).toBe(player.id);
    expect((await playerForToken(store, token))?.id).toBe(player.id);
    // Only the token's hash is kept.
    expect([...store.sessions.keys()]).toEqual([await sha256(token)]);
  });

  it('gives each sign-in its own token, and all of them work', async () => {
    const { player, code } = await createPlayer(store, deps, 'Alex');
    const a = await login(store, deps, code);
    const b = await login(store, deps, code);
    expect(a.token).not.toBe(b.token);
    expect((await playerForToken(store, a.token))?.id).toBe(player.id);
    expect((await playerForToken(store, b.token))?.id).toBe(player.id);
  });

  it('refuses a wrong or badly formed code', async () => {
    const { code } = await createPlayer(store, deps, 'Alex');
    const wrong = code === '000000' ? '000001' : '000000';
    await refused(login(store, deps, wrong), 'bad-code', 401);
    await refused(login(store, deps, code.slice(0, 5)), 'bad-code', 401);
    await refused(login(store, deps, `${code}0`), 'bad-code', 401);
    await refused(login(store, deps, 'abcdef'), 'bad-code', 401);
    await refused(login(store, deps, Number(code)), 'bad-code', 401);
    await refused(login(store, deps, undefined), 'bad-code', 401);
    expect(store.sessions.size).toBe(0);
  });

  it('finds nobody for a missing or made-up token', async () => {
    await createPlayer(store, deps, 'Alex');
    expect(await playerForToken(store, null)).toBeNull();
    expect(await playerForToken(store, '')).toBeNull();
    expect(await playerForToken(store, 'made-up')).toBeNull();
  });
});

describe('resetting a code', () => {
  it('gives a new code, stops the old one and signs the headset out', async () => {
    const { player, code } = await createPlayer(store, deps, 'Alex');
    const { token } = await login(store, deps, code);

    const { code: fresh } = await resetCode(store, deps, player.id);
    expect(fresh).toMatch(/^\d{6}$/);
    expect(fresh).not.toBe(code);
    await refused(login(store, deps, code), 'bad-code', 401);
    expect(await playerForToken(store, token)).toBeNull();

    const again = await login(store, deps, fresh);
    expect(again.player.id).toBe(player.id);
  });

  it('leaves other players signed in', async () => {
    const alex = await createPlayer(store, deps, 'Alex');
    const sam = await createPlayer(store, deps, 'Sam');
    const { token } = await login(store, deps, sam.code);
    await resetCode(store, deps, alex.player.id);
    expect((await playerForToken(store, token))?.id).toBe(sam.player.id);
  });

  it('refuses a player that does not exist', async () => {
    await refused(resetCode(store, deps, 'nobody'), 'no-such-player', 404);
  });
});

describe('choosing a follower', () => {
  it('makes one of the player’s own pets follow them', async () => {
    const { player } = await createPlayer(store, deps, 'Alex');
    const given = await givePet(store, deps, player.id, 'ember');
    await chooseFollower(store, player, given.id);
    expect((await playerView(store, player.id)).followerId).toBe(given.id);
  });

  it('refuses a pet that is missing, somebody else’s, an egg or set free', async () => {
    const alex = await createPlayer(store, deps, 'Alex');
    const sam = await createPlayer(store, deps, 'Sam');
    const sams = await givePet(store, deps, sam.player.id, 'prism');
    const before = alex.player.followerId;

    await refused(chooseFollower(store, alex.player, sams.id), 'no-such-pet', 404);
    await refused(chooseFollower(store, alex.player, 'nothing'), 'no-such-pet', 404);
    await refused(chooseFollower(store, alex.player, undefined), 'no-such-pet', 404);
    await refused(chooseFollower(store, alex.player, 7), 'no-such-pet', 404);

    const own = await givePet(store, deps, alex.player.id, 'sky');
    store.petRows.get(own.id)!.stage = 'egg';
    await refused(chooseFollower(store, alex.player, own.id), 'no-such-pet', 404);
    store.petRows.get(own.id)!.stage = 'freed';
    await refused(chooseFollower(store, alex.player, own.id), 'no-such-pet', 404);

    expect((await store.player(alex.player.id))!.followerId).toBe(before);
  });
});

describe('giving and removing pets', () => {
  it('gives a player a copy of a fixed pet', async () => {
    const { player } = await createPlayer(store, deps, 'Alex');
    const pet = await givePet(store, deps, player.id, 'prism');
    expect(pet.dna).toEqual(founders.prism.dna);
    expect(tierOf(pet.dna)).toBe('mythical');

    const view = await playerView(store, player.id);
    expect(view.pets.map((p) => p.id)).toContain(pet.id);
    expect(view.pets).toHaveLength(2);
    // The starter pet still follows.
    expect(view.followerId).not.toBe(pet.id);

    // A copy: changing it leaves the fixed pet alone.
    pet.dna.colors.head = 0;
    expect(founders.prism.dna.colors.head).not.toBe(0);
  });

  it('gives the pet in a present to the player who opened it, and makes it follow them at once', async () => {
    const { player } = await createPlayer(store, deps, 'Alex');
    const pet = await openPresent(store, deps, player.id, 'sunny');
    expect(tierOf(pet.dna)).toBe('ultra');
    const view = await playerView(store, player.id);
    expect(view.pets.map((p) => p.id)).toContain(pet.id);
    expect(view.followerId).toBe(pet.id);
  });

  it('gives nothing from a present to a player with no room, and leaves their follower alone', async () => {
    const { player } = await createPlayer(store, deps, 'Alex');
    for (let i = 1; i < PET_CAP; i++) await givePet(store, deps, player.id, 'pip');
    const before = (await playerView(store, player.id)).followerId;
    await refused(openPresent(store, deps, player.id, 'sunny'), 'full', 409);
    const view = await playerView(store, player.id);
    expect(view.pets).toHaveLength(PET_CAP);
    expect(view.followerId).toBe(before);
  });

  it('refuses a player or fixed pet that does not exist', async () => {
    const { player } = await createPlayer(store, deps, 'Alex');
    await refused(givePet(store, deps, 'nobody', 'pip'), 'no-such-player', 404);
    await refused(givePet(store, deps, player.id, 'dragon'), 'no-such-founder', 404);
    await refused(givePet(store, deps, player.id, 'constructor'), 'no-such-founder', 404);
    await refused(givePet(store, deps, player.id, '__proto__'), 'no-such-founder', 404);
    await refused(givePet(store, deps, player.id, undefined), 'no-such-founder', 404);
  });

  it('stops at 24 pets', async () => {
    expect(PET_CAP).toBe(24);
    const { player } = await createPlayer(store, deps, 'Alex');
    for (let i = 1; i < PET_CAP; i++) await givePet(store, deps, player.id, 'pip');
    expect((await playerView(store, player.id)).pets).toHaveLength(PET_CAP);
    await refused(givePet(store, deps, player.id, 'pip'), 'full', 409);
    expect((await playerView(store, player.id)).pets).toHaveLength(PET_CAP);
  });

  it('removes a pet, and stops it following if it was the follower', async () => {
    const { player } = await createPlayer(store, deps, 'Alex');
    const given = await givePet(store, deps, player.id, 'sky');
    const starter = (await playerView(store, player.id)).followerId!;

    await removePet(store, given.id);
    let view = await playerView(store, player.id);
    expect(view.pets.map((p) => p.id)).toEqual([starter]);
    expect(view.followerId).toBe(starter);

    await removePet(store, starter);
    view = await playerView(store, player.id);
    expect(view.pets).toEqual([]);
    expect(view.followerId).toBeNull();

    await refused(removePet(store, starter), 'no-such-pet', 404);
  });

  it('lists every player with their pets for the admin page', async () => {
    const alex = await createPlayer(store, deps, 'Alex');
    const sam = await createPlayer(store, deps, 'Sam');
    await givePet(store, deps, sam.player.id, 'ember');

    const all = await overview(store, deps);
    expect(all.map((p) => p.nickname)).toEqual(['Alex', 'Sam']);
    expect(all.find((p) => p.id === alex.player.id)!.pets).toHaveLength(1);
    expect(all.find((p) => p.id === sam.player.id)!.pets).toHaveLength(2);
    // Nothing secret is in the list.
    expect(JSON.stringify(all)).not.toContain('codeHash');
  });

  it('leaves freed pets out of what a player has', async () => {
    const { player } = await createPlayer(store, deps, 'Alex');
    const given = await givePet(store, deps, player.id, 'sky');
    store.petRows.get(given.id)!.stage = 'freed';
    expect((await playerView(store, player.id)).pets.map((p) => p.id)).not.toContain(given.id);
    // A freed pet does not count towards the cap.
    for (let i = 1; i < PET_CAP; i++) await givePet(store, deps, player.id, 'pip');
    await refused(givePet(store, deps, player.id, 'pip'), 'full', 409);
  });
});

/** A player with a number of hatched pets, the first being their starter. */
async function playerWith(name: string, pets: number): Promise<{ player: PlayerRow; ids: string[] }> {
  const { player } = await createPlayer(store, deps, name);
  for (let i = 1; i < pets; i++) await givePet(store, deps, player.id, i % 2 ? 'ember' : 'tango');
  return { player, ids: (await playerView(store, player.id)).pets.map((pet) => pet.id) };
}

describe('breeding two of your own pets', () => {
  it('lays one egg, telling its shell but not what is inside', async () => {
    const { player, ids } = await playerWith('Alex', 2);
    await breedOwn(store, deps, player, ids[0], ids[1]);

    const view = await playerView(store, player.id);
    expect(view.pets.map((pet) => pet.id)).toEqual(ids);
    expect(view.egg).not.toBeNull();
    expect(view.egg!.seeds).toBe(0);
    expect(view.egg!.shell).toHaveLength(2);
    expect(JSON.stringify(view.egg)).not.toContain('glow');

    // What will hatch is fixed on the server from the start.
    const row = store.petRows.get(view.egg!.id)!;
    expect(row.stage).toBe('egg');
    expect([row.parentA, row.parentB]).toEqual(ids);
    expect(row.dna.colors).toBeDefined();
  });

  it('refuses a pet bred with itself, or with a pet that is not the player\'s', async () => {
    const alex = await playerWith('Alex', 2);
    const sam = await playerWith('Sam', 1);
    await refused(breedOwn(store, deps, alex.player, alex.ids[0], alex.ids[0]), 'same-pet', 400);
    await refused(breedOwn(store, deps, alex.player, alex.ids[0], sam.ids[0]), 'no-such-pet', 404);
    await refused(breedOwn(store, deps, alex.player, alex.ids[0], undefined), 'no-such-pet', 404);
    expect((await playerView(store, alex.player.id)).egg).toBeNull();
  });

  it('allows only one egg at a time', async () => {
    const { player, ids } = await playerWith('Alex', 3);
    await breedOwn(store, deps, player, ids[0], ids[1]);
    await refused(breedOwn(store, deps, player, ids[1], ids[2]), 'has-egg', 409);
  });

  it('counts the egg towards the 24', async () => {
    const full = await playerWith('Full', PET_CAP);
    await refused(breedOwn(store, deps, full.player, full.ids[0], full.ids[1]), 'full', 409);

    const nearly = await playerWith('Nearly', PET_CAP - 1);
    await breedOwn(store, deps, nearly.player, nearly.ids[0], nearly.ids[1]);
    await refused(givePet(store, deps, nearly.player.id, 'pip'), 'full', 409);
  });
});

describe('asking a friend for DNA', () => {
  let alex: { player: PlayerRow; ids: string[] };
  let sam: { player: PlayerRow; ids: string[] };
  beforeEach(async () => {
    alex = await playerWith('Alex', 2);
    sam = await playerWith('Sam', 2);
  });

  it('shows the request to both players, each from their own side', async () => {
    await askFor(store, deps, alex.player, alex.ids[0], sam.ids[1]);

    const asking = (await playerView(store, alex.player.id)).asking!;
    expect(asking.myPetId).toBe(alex.ids[0]);
    expect(asking.friend).toBe('Sam');
    expect(asking.theirPet.id).toBe(sam.ids[1]);

    const asked = (await playerView(store, sam.player.id)).asked;
    expect(asked).toHaveLength(1);
    expect(asked[0].id).toBe(asking.id);
    expect(asked[0].myPetId).toBe(sam.ids[1]);
    expect(asked[0].friend).toBe('Alex');
    expect(asked[0].theirPet.id).toBe(alex.ids[0]);
  });

  it('refuses a pet that is the player\'s own, missing, an egg or set free', async () => {
    await refused(askFor(store, deps, alex.player, alex.ids[0], alex.ids[1]), 'no-such-pet', 404);
    await refused(askFor(store, deps, alex.player, alex.ids[0], 'nothing'), 'no-such-pet', 404);
    await refused(askFor(store, deps, alex.player, sam.ids[0], sam.ids[1]), 'no-such-pet', 404);
    store.petRows.get(sam.ids[1])!.stage = 'freed';
    await refused(askFor(store, deps, alex.player, alex.ids[0], sam.ids[1]), 'no-such-pet', 404);
    expect(store.requestRows.size).toBe(0);
  });

  it('holds the place for the egg while waiting for the answer', async () => {
    await askFor(store, deps, alex.player, alex.ids[0], sam.ids[0]);
    // No second request, and no egg of the player's own, until it is answered.
    await refused(askFor(store, deps, alex.player, alex.ids[1], sam.ids[1]), 'has-egg', 409);
    await refused(breedOwn(store, deps, alex.player, alex.ids[0], alex.ids[1]), 'has-egg', 409);

    // With 23 pets and a request out, a 24th pet would leave no room for the egg.
    const nearly = await playerWith('Nearly', PET_CAP - 1);
    await askFor(store, deps, nearly.player, nearly.ids[0], sam.ids[0]);
    await refused(givePet(store, deps, nearly.player.id, 'pip'), 'full', 409);
  });

  it('cannot be made by a player who has an egg, or who is full', async () => {
    await breedOwn(store, deps, alex.player, alex.ids[0], alex.ids[1]);
    await refused(askFor(store, deps, alex.player, alex.ids[0], sam.ids[0]), 'has-egg', 409);
    const full = await playerWith('Full', PET_CAP);
    await refused(askFor(store, deps, full.player, full.ids[0], sam.ids[0]), 'full', 409);
  });

  it('lays the egg in the asker\'s nest on a yes, at no cost to the giver', async () => {
    await askFor(store, deps, alex.player, alex.ids[0], sam.ids[1]);
    const { id } = (await playerView(store, sam.player.id)).asked[0];
    await answer(store, deps, sam.player, id, true);

    const asker = await playerView(store, alex.player.id);
    expect(asker.asking).toBeNull();
    expect(asker.egg).not.toBeNull();
    const row = store.petRows.get(asker.egg!.id)!;
    expect(row.ownerId).toBe(alex.player.id);
    expect([row.parentA, row.parentB]).toEqual([alex.ids[0], sam.ids[1]]);

    const giver = await playerView(store, sam.player.id);
    expect(giver.asked).toEqual([]);
    expect(giver.egg).toBeNull();
    expect(giver.pets.map((pet) => pet.id)).toEqual(sam.ids);
  });

  it('lays nothing on a no, and frees the asker to ask again', async () => {
    await askFor(store, deps, alex.player, alex.ids[0], sam.ids[1]);
    const { id } = (await playerView(store, sam.player.id)).asked[0];
    await answer(store, deps, sam.player, id, false);
    const asker = await playerView(store, alex.player.id);
    expect(asker.asking).toBeNull();
    expect(asker.egg).toBeNull();
    await askFor(store, deps, alex.player, alex.ids[0], sam.ids[0]);
    expect((await playerView(store, alex.player.id)).asking).not.toBeNull();
  });

  it('takes anything but a plain yes as a no', async () => {
    await askFor(store, deps, alex.player, alex.ids[0], sam.ids[1]);
    const { id } = (await playerView(store, sam.player.id)).asked[0];
    await answer(store, deps, sam.player, id, 'yes');
    expect((await playerView(store, alex.player.id)).egg).toBeNull();
  });

  it('can be answered only by the player who was asked', async () => {
    await askFor(store, deps, alex.player, alex.ids[0], sam.ids[1]);
    const { id } = (await playerView(store, sam.player.id)).asked[0];
    const pat = await playerWith('Pat', 1);
    await refused(answer(store, deps, alex.player, id, true), 'no-such-request', 404);
    await refused(answer(store, deps, pat.player, id, true), 'no-such-request', 404);
    await refused(answer(store, deps, sam.player, 'nothing', true), 'no-such-request', 404);
    expect((await playerView(store, alex.player.id)).egg).toBeNull();
    expect(store.requestRows.size).toBe(1);
  });

  it('can be taken back by the asker, and by nobody else', async () => {
    await askFor(store, deps, alex.player, alex.ids[0], sam.ids[1]);
    const { id } = (await playerView(store, alex.player.id)).asking!;
    await refused(cancelRequest(store, sam.player, id), 'no-such-request', 404);
    await cancelRequest(store, alex.player, id);
    expect((await playerView(store, alex.player.id)).asking).toBeNull();
    expect((await playerView(store, sam.player.id)).asked).toEqual([]);
  });

  it('lets several friends ask for the same pet, oldest first', async () => {
    const pat = await playerWith('Pat', 1);
    await askFor(store, deps, alex.player, alex.ids[0], sam.ids[0]);
    await askFor(store, deps, pat.player, pat.ids[0], sam.ids[0]);
    const asked = (await playerView(store, sam.player.id)).asked;
    expect(asked.map((request) => request.friend)).toEqual(['Alex', 'Pat']);
  });
});

describe('feeding the egg', () => {
  it('hatches it on the third seed, into the pet it was always going to be', async () => {
    const { player, ids } = await playerWith('Alex', 2);
    await breedOwn(store, deps, player, ids[0], ids[1]);
    const egg = (await playerView(store, player.id)).egg!;
    const inside = structuredClone(store.petRows.get(egg.id)!.dna);
    expect(SEEDS_TO_HATCH).toBe(3);

    expect(await feedEgg(store, player)).toBeNull();
    expect((await playerView(store, player.id)).egg!.seeds).toBe(1);
    expect(await feedEgg(store, player)).toBeNull();
    expect((await playerView(store, player.id)).egg!.seeds).toBe(2);
    expect(await feedEgg(store, player)).toBe(egg.id);

    const view = await playerView(store, player.id);
    expect(view.egg).toBeNull();
    expect(view.pets.map((pet) => pet.id)).toEqual([...ids, egg.id]);
    expect(view.pets[2].dna).toEqual(inside);
  });

  it('refuses when there is no egg', async () => {
    const { player } = await playerWith('Alex', 2);
    await refused(feedEgg(store, player), 'no-egg', 404);
  });

  it('leaves room for the next egg once it has hatched', async () => {
    const { player, ids } = await playerWith('Alex', 2);
    await breedOwn(store, deps, player, ids[0], ids[1]);
    for (let i = 0; i < SEEDS_TO_HATCH; i++) await feedEgg(store, player);
    await breedOwn(store, deps, player, ids[0], ids[1]);
    expect((await playerView(store, player.id)).egg).not.toBeNull();
  });
});

describe('setting a pet free', () => {
  const DAY = 24 * 60 * 60 * 1000;

  it('takes the pet away, stops it following, and drops requests that name it', async () => {
    const alex = await playerWith('Alex', 3);
    const sam = await playerWith('Sam', 2);
    const pat = await playerWith('Pat', 1);
    const follower = alex.player.followerId!;
    await askFor(store, deps, alex.player, follower, sam.ids[0]); // names it as the asker's pet
    await askFor(store, deps, pat.player, pat.ids[0], follower); // names it as the pet asked for

    await freePet(store, deps, alex.player, follower);
    const view = await playerView(store, alex.player.id);
    expect(view.pets.map((pet) => pet.id)).not.toContain(follower);
    expect(view.followerId).toBeNull();
    expect(view.asking).toBeNull();
    expect(view.asked).toEqual([]);
    expect(store.requestRows.size).toBe(0);
    // Kept, not deleted.
    expect(store.petRows.get(follower)!.stage).toBe('freed');
    expect(store.petRows.get(follower)!.freedAt).toBeGreaterThan(0);
  });

  it('never frees a player\'s last pet, an egg, or somebody else\'s pet', async () => {
    const alex = await playerWith('Alex', 2);
    const sam = await playerWith('Sam', 1);
    await refused(freePet(store, deps, sam.player, sam.ids[0]), 'last-pet', 409);
    await refused(freePet(store, deps, alex.player, sam.ids[0]), 'no-such-pet', 404);

    await breedOwn(store, deps, alex.player, alex.ids[0], alex.ids[1]);
    const egg = (await playerView(store, alex.player.id)).egg!;
    await refused(freePet(store, deps, alex.player, egg.id), 'no-such-pet', 404);

    // An egg is not a pet to be left with.
    await freePet(store, deps, alex.player, alex.ids[1]);
    await refused(freePet(store, deps, alex.player, alex.ids[0]), 'last-pet', 409);
  });

  it('can be undone by the owner of the game for 30 days', async () => {
    const { player, ids } = await playerWith('Alex', 2);
    await freePet(store, deps, player, ids[1]);

    let [admin] = await overview(store, deps);
    expect(admin.pets.map((pet) => pet.id)).toEqual([ids[0]]);
    expect(admin.freed.map((pet) => pet.id)).toEqual([ids[1]]);

    await restorePet(store, ids[1]);
    [admin] = await overview(store, deps);
    expect(admin.pets.map((pet) => pet.id)).toEqual(ids);
    expect(admin.freed).toEqual([]);
    await refused(restorePet(store, ids[1]), 'no-such-pet', 404);
  });

  it('forgets a freed pet after 30 days', async () => {
    const { player, ids } = await playerWith('Alex', 3);
    await freePet(store, deps, player, ids[1]);
    await freePet(store, deps, player, ids[2]);
    store.petRows.get(ids[1])!.freedAt = deps.now() - 31 * DAY;
    store.petRows.get(ids[2])!.freedAt = deps.now() - 29 * DAY;

    const [admin] = await overview(store, deps);
    expect(admin.freed.map((pet) => pet.id)).toEqual([ids[2]]);
    expect(store.petRows.has(ids[1])).toBe(false);
    await refused(restorePet(store, ids[1]), 'no-such-pet', 404);
  });

  it('cannot be undone into a full nest', async () => {
    const { player, ids } = await playerWith('Alex', PET_CAP);
    await freePet(store, deps, player, ids[5]);
    await givePet(store, deps, player.id, 'pip');
    await refused(restorePet(store, ids[5]), 'full', 409);
  });
});

describe('friends', () => {
  it('lists the other players with their hatched pets, and never the player themself', async () => {
    const alex = await playerWith('Alex', 2);
    const sam = await playerWith('Sam', 3);
    await playerWith('Pat', 1);
    await breedOwn(store, deps, sam.player, sam.ids[0], sam.ids[1]);
    await freePet(store, deps, sam.player, sam.ids[2]);

    const friends = await friendsOf(store, alex.player);
    expect(friends.map((friend) => friend.nickname)).toEqual(['Sam', 'Pat']);
    expect(friends[0].pets.map((pet) => pet.id)).toEqual([sam.ids[0], sam.ids[1]]);
    expect(JSON.stringify(friends)).not.toContain('codeHash');
  });
});

describe('deleting a player', () => {
  it('takes the player, their sign-ins, their pets and their egg away for good', async () => {
    const { player, code } = await createPlayer(store, deps, 'Alex');
    const { token } = await login(store, deps, code);
    const second = await givePet(store, deps, player.id, 'ember');
    const first = (await playerView(store, player.id)).pets[0].id;
    await givePet(store, deps, player.id, 'tango');
    await breedOwn(store, deps, player, first, second.id);
    await freePet(store, deps, player, second.id);

    await removePlayer(store, player.id);

    expect(await store.player(player.id)).toBeNull();
    expect(await playerForToken(store, token)).toBeNull();
    await refused(login(store, deps, code), 'bad-code', 401);
    // Hatched, egg and set free alike.
    expect(store.petRows.size).toBe(0);
    expect(store.sessions.size).toBe(0);
    expect(await overview(store, deps)).toEqual([]);
  });

  it('drops every request to or from them, and leaves their friends as they were', async () => {
    const alex = await playerWith('Alex', 2);
    const sam = await playerWith('Sam', 2);
    const pat = await playerWith('Pat', 1);
    await askFor(store, deps, alex.player, alex.ids[0], sam.ids[0]); // from the player
    await askFor(store, deps, pat.player, pat.ids[0], alex.ids[1]); // to the player
    await askFor(store, deps, sam.player, sam.ids[1], pat.ids[0]); // nothing to do with them

    await removePlayer(store, alex.player.id);

    expect(store.requestRows.size).toBe(1);
    const samNow = await playerView(store, sam.player.id);
    expect(samNow.pets.map((pet) => pet.id)).toEqual(sam.ids);
    expect(samNow.asked).toEqual([]);
    expect(samNow.asking).not.toBeNull();
    // Pat was waiting for the deleted player's answer, and can now ask somebody else.
    const patNow = await playerView(store, pat.player.id);
    expect(patNow.asking).toBeNull();
    await askFor(store, deps, pat.player, pat.ids[0], sam.ids[0]);
    // And the deleted player is no longer among anybody's friends.
    expect((await friendsOf(store, sam.player)).map((friend) => friend.nickname)).toEqual(['Pat']);
  });

  it('frees the nickname\'s code for nobody: a new player gets a new code', async () => {
    const { player, code } = await createPlayer(store, deps, 'Alex');
    await removePlayer(store, player.id);
    const again = await createPlayer(store, deps, 'Alex');
    expect(again.player.id).not.toBe(player.id);
    expect((await login(store, deps, again.code)).player.id).toBe(again.player.id);
    if (again.code !== code) await refused(login(store, deps, code), 'bad-code', 401);
  });

  it('refuses a player that does not exist', async () => {
    await refused(removePlayer(store, 'nobody'), 'no-such-player', 404);
  });
});

describe('the helper parrot', () => {
  const DAY = 24 * 60 * 60 * 1000;
  let store: MemoryStore;
  let deps: ReturnType<typeof testDeps>;
  let sam: PlayerRow;
  const said = (at: number, heard: string, flagged: string | null = null): Promise<void> =>
    keepTalk(store, deps, { at, lobbyId: 'aviary', playerId: sam.id, nickname: 'Sam', heard, said: `reply to ${heard}`, flagged });

  beforeEach(async () => {
    store = new MemoryStore();
    deps = testDeps();
    sam = (await createPlayer(store, deps, 'Sam')).player;
  });

  it('is on until the owner switches it off', async () => {
    expect(await helperOn(store)).toBe(true);
    await setHelperOn(store, false);
    expect(await helperOn(store)).toBe(false);
    await setHelperOn(store, true);
    expect(await helperOn(store)).toBe(true);
    // Anything that is not a plain yes switches it off.
    await setHelperOn(store, 'yes');
    expect(await helperOn(store)).toBe(false);
  });

  it('shows the owner what was said: flagged talk first, each newest first', async () => {
    const now = deps.now();
    await said(now - 4000, 'one');
    await said(now - 3000, 'two', 'worry: sad');
    await said(now - 2000, 'three');
    await said(now - 1000, 'four', 'refused: a link');
    const view = await talkView(store, deps);
    expect(view.map((t) => t.heard)).toEqual(['four', 'two', 'three', 'one']);
    expect(view[0]).toEqual({
      at: now - 1000,
      lobbyId: 'aviary',
      nickname: 'Sam',
      heard: 'four',
      said: 'reply to four',
      flagged: 'refused: a link',
    });
  });

  it('forgets what was said more than a week ago', async () => {
    const now = deps.now();
    await said(now - 8 * DAY, 'old');
    await said(now - 6 * DAY, 'new');
    await forgetOldTalk(store, deps);
    expect(store.talkRows.map((t) => t.heard)).toEqual(['new']);
    // Looking at the talk forgets the old as well.
    await said(now - 9 * DAY, 'older');
    expect((await talkView(store, deps)).map((t) => t.heard)).toEqual(['new']);
  });

  it('forgets what a player said when the player is removed', async () => {
    const alex = (await createPlayer(store, deps, 'Alex')).player;
    await said(deps.now(), 'from Sam');
    await keepTalk(store, deps, { at: deps.now(), lobbyId: 'aviary', playerId: alex.id, nickname: 'Alex', heard: 'from Alex', said: 'hi', flagged: null });
    await removePlayer(store, sam.id);
    expect(store.talkRows.map((t) => t.heard)).toEqual(['from Alex']);
  });

  it('knows a player by their pets and egg, and nothing else', async () => {
    expect(await aboutPlayer(store, sam.id)).toBe('They have 1 pet and no egg.');
    const [pet] = await store.petsOf(sam.id);
    await breedOwn(store, deps, sam, pet.id, (await givePet(store, deps, sam.id, Object.keys(founders)[0])).id);
    await feedEgg(store, sam);
    expect(await aboutPlayer(store, sam.id)).toBe(`They have 2 pets, and an egg that has been fed 1 of ${SEEDS_TO_HATCH} times.`);
  });
});
