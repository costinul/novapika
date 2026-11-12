import { beforeEach, describe, expect, it } from 'vitest';
import {
  chooseFollower,
  createPlayer,
  givePet,
  login,
  overview,
  playerForToken,
  playerView,
  Refusal,
  removePet,
  resetCode,
  sha256,
} from '../server/rules';
import type { Deps } from '../server/rules';
import { PET_CAP } from '../shared/api';
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
      const view = await playerView(store, player);
      expect(view.pets).toHaveLength(1);
      expect(view.pets[0].stage).toBe('hatched');
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
    const after = await chooseFollower(store, player, given.id);
    expect(after.followerId).toBe(given.id);
    expect((await playerView(store, (await store.player(player.id))!)).followerId).toBe(given.id);
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

    const view = await playerView(store, player);
    expect(view.pets.map((p) => p.id)).toContain(pet.id);
    expect(view.pets).toHaveLength(2);
    // The starter pet still follows.
    expect(view.followerId).not.toBe(pet.id);

    // A copy: changing it leaves the fixed pet alone.
    pet.dna.colors.head = 0;
    expect(founders.prism.dna.colors.head).not.toBe(0);
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
    expect((await playerView(store, player)).pets).toHaveLength(PET_CAP);
    await refused(givePet(store, deps, player.id, 'pip'), 'full', 409);
    expect((await playerView(store, player)).pets).toHaveLength(PET_CAP);
  });

  it('removes a pet, and stops it following if it was the follower', async () => {
    const { player } = await createPlayer(store, deps, 'Alex');
    const given = await givePet(store, deps, player.id, 'sky');
    const starter = (await playerView(store, player)).followerId!;

    await removePet(store, given.id);
    let view = await playerView(store, (await store.player(player.id))!);
    expect(view.pets.map((p) => p.id)).toEqual([starter]);
    expect(view.followerId).toBe(starter);

    await removePet(store, starter);
    view = await playerView(store, (await store.player(player.id))!);
    expect(view.pets).toEqual([]);
    expect(view.followerId).toBeNull();

    await refused(removePet(store, starter), 'no-such-pet', 404);
  });

  it('lists every player with their pets for the admin page', async () => {
    const alex = await createPlayer(store, deps, 'Alex');
    const sam = await createPlayer(store, deps, 'Sam');
    await givePet(store, deps, sam.player.id, 'ember');

    const all = await overview(store);
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
    expect((await playerView(store, player)).pets.map((p) => p.id)).not.toContain(given.id);
    // A freed pet does not count towards the cap.
    for (let i = 1; i < PET_CAP; i++) await givePet(store, deps, player.id, 'pip');
    await refused(givePet(store, deps, player.id, 'pip'), 'full', 409);
  });
});
