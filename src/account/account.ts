import type { FriendView, PlacesView, PlayerView } from '../../shared/api';

// Signing in. A player types their 6-digit code once; the server swaps it
// for a token, which is all this device keeps. Nobody plays without it.

const TOKEN_KEY = 'novapika.token';

/** Who is signed in on this device, as far as the game can tell. */
export type Account =
  | { status: 'out' }
  /** Somebody is signed in, but the server cannot be reached just now. */
  | { status: 'offline' }
  | { status: 'in'; player: PlayerView };

/** The token kept on this device, or null. */
export function savedToken(): string | null {
  try {
    return globalThis.localStorage?.getItem(TOKEN_KEY) ?? null;
  } catch {
    return null; // Storage switched off: nobody stays signed in.
  }
}

function saveToken(token: string | null): void {
  try {
    if (token) globalThis.localStorage?.setItem(TOKEN_KEY, token);
    else globalThis.localStorage?.removeItem(TOKEN_KEY);
  } catch {
    // Storage switched off: the sign-in just lasts for this visit.
  }
}

export type SignInResult =
  | { ok: true; player: PlayerView }
  /** Wrong code, too many tries for now, or the server could not be reached. */
  | { ok: false; why: 'bad-code' | 'slow-down' | 'offline' };

/** Swap a code for a token and keep it. */
export async function signIn(code: string): Promise<SignInResult> {
  try {
    const response = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    if (response.status === 401) return { ok: false, why: 'bad-code' };
    if (response.status === 429) return { ok: false, why: 'slow-down' };
    if (!response.ok) return { ok: false, why: 'offline' };
    const { token, player } = (await response.json()) as { token: string; player: PlayerView };
    saveToken(token);
    return { ok: true, player };
  } catch {
    return { ok: false, why: 'offline' };
  }
}

/**
 * Who is signed in on this device. A token the server no longer takes is
 * dropped. With no connection the token is kept for next time.
 */
export async function loadAccount(): Promise<Account> {
  const token = savedToken();
  if (!token) return { status: 'out' };
  try {
    const response = await fetch('/api/me', { headers: { Authorization: `Bearer ${token}` } });
    if (response.status === 401) {
      saveToken(null);
      return { status: 'out' };
    }
    if (!response.ok) return { status: 'offline' };
    return { status: 'in', player: ((await response.json()) as { player: PlayerView }).player };
  } catch {
    return { status: 'offline' };
  }
}

/**
 * Call the server as the signed-in player. Gives its answer, or null if it
 * refused, could not be reached, or nobody is signed in.
 */
async function call<T>(method: string, path: string, body?: object): Promise<T | null> {
  const token = savedToken();
  if (!token) return null;
  try {
    const response = await fetch(`/api${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

/**
 * The servers two players' games use to find a way to each other for voice.
 * Without the server's answer, the free one that needs no pass.
 */
export const iceServers = async (): Promise<RTCIceServer[]> =>
  (await call<{ iceServers: RTCIceServer[] }>('GET', '/ice'))?.iceServers ?? [{ urls: 'stun:stun.cloudflare.com:3478' }];

/** How many players are in each place now, by lobby id; null if the server cannot say. */
export const placeCounts = async (): Promise<Record<string, number> | null> =>
  (await call<PlacesView>('GET', '/places'))?.counts ?? null;

/** A change that answers with the player as the server now has them. */
const change = async (method: string, path: string, body?: object): Promise<PlayerView | null> =>
  (await call<{ player: PlayerView }>(method, path, body))?.player ?? null;

/**
 * Everything the game asks the server about pets. Each gives null when the
 * server refuses or cannot be reached; nothing in the game changes until the
 * server has agreed.
 */
export interface PetsApi {
  /** Who is signed in, read afresh. */
  account(): Promise<Account>;
  /** The other players and their pets. */
  friends(): Promise<FriendView[] | null>;
  /** Make one of the player's pets follow them. */
  follow(petId: string): Promise<PlayerView | null>;
  /** Two of the player's own pets make an egg. */
  breed(petA: string, petB: string): Promise<PlayerView | null>;
  /** Ask a friend for the DNA of their pet, to pair with one of the player's. */
  ask(myPetId: string, theirPetId: string): Promise<PlayerView | null>;
  /** Say yes or no to a friend's request. */
  answer(requestId: string, accept: boolean): Promise<PlayerView | null>;
  /** Take back the player's own request. */
  cancel(requestId: string): Promise<PlayerView | null>;
  /** Feed the egg one seed. `hatched` is the pet that came out, if this was the last. */
  feed(): Promise<{ player: PlayerView; hatched: string | null } | null>;
  /** Set a pet free. */
  free(petId: string): Promise<PlayerView | null>;
}

export const petsApi: PetsApi = {
  account: loadAccount,
  friends: async () => (await call<{ friends: FriendView[] }>('GET', '/friends'))?.friends ?? null,
  follow: (petId) => change('POST', '/me/follower', { petId }),
  breed: (petA, petB) => change('POST', '/breed', { petA, petB }),
  ask: (myPetId, theirPetId) => change('POST', '/requests', { myPetId, theirPetId }),
  answer: (requestId, accept) => change('POST', `/requests/${requestId}`, { accept }),
  cancel: (requestId) => change('DELETE', `/requests/${requestId}`),
  feed: () => call('POST', '/egg/feed', {}),
  free: (petId) => change('POST', `/pets/${petId}/free`, {}),
};
