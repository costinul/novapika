import * as rules from '../server/rules';
import type { Deps } from '../server/rules';
import type { PlayerRow } from '../server/store';
import type { PlayerView } from '../shared/api';
import type { PetsApi } from '../src/account/account';
import type { MemoryStore } from './memoryStore';

/** Fixed ids, times and tokens, and a random that repeats from run to run. */
export function testDeps(seed = 1): Deps {
  let n = 0;
  return {
    now: () => 1_000_000 + ++n,
    id: () => `id-${++n}`,
    token: () => `token-${++n}`,
    random: () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}

/**
 * The server as the game sees it, without a network: the real rules over a
 * store the test can look into. `playerId` is who is signed in. Set `down`
 * to make it unreachable.
 */
export function fakeServer(store: MemoryStore, deps: Deps, playerId: string): PetsApi & { down: boolean; calls: string[] } {
  const me = async (): Promise<PlayerRow> => (await store.player(playerId))!;
  const change = async (name: string, act: (player: PlayerRow) => Promise<unknown>): Promise<PlayerView | null> => {
    server.calls.push(name);
    if (server.down) return null;
    try {
      await act(await me());
      return await rules.playerView(store, playerId);
    } catch (error) {
      if (error instanceof rules.Refusal) return null;
      throw error;
    }
  };
  const server: PetsApi & { down: boolean; calls: string[] } = {
    down: false,
    calls: [],
    account: async () =>
      server.down ? { status: 'offline' } : { status: 'in', player: await rules.playerView(store, playerId) },
    friends: async () => (server.down ? null : rules.friendsOf(store, await me())),
    follow: (petId) => change('follow', (player) => rules.chooseFollower(store, player, petId)),
    breed: (a, b) => change('breed', (player) => rules.breedOwn(store, deps, player, a, b)),
    ask: (mine, theirs) => change('ask', (player) => rules.askFor(store, deps, player, mine, theirs)),
    answer: (id, accept) => change('answer', (player) => rules.answer(store, deps, player, id, accept)),
    cancel: (id) => change('cancel', (player) => rules.cancelRequest(store, player, id)),
    feed: async () => {
      let hatched: string | null = null;
      const player = await change('feed', async (row) => {
        hatched = await rules.feedEgg(store, row);
      });
      return player ? { player, hatched } : null;
    },
    free: (petId) => change('free', (player) => rules.freePet(store, deps, player, petId)),
  };
  return server;
}
