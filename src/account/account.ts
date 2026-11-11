import type { PlayerView } from '../../shared/api';

// Signing in. A player types their 6-digit code once; the server swaps it
// for a token, which is all this device keeps. The game plays the same
// without it, just with no pets.

const TOKEN_KEY = 'novapika.token';

/** The token kept on this device, or null. Used for every call that is the player's own. */
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
 * The player signed in on this device, or null. A token the server no longer
 * takes is dropped. With no connection the token is kept for next time.
 */
export async function signedInPlayer(): Promise<PlayerView | null> {
  const token = savedToken();
  if (!token) return null;
  try {
    const response = await fetch('/api/me', { headers: { Authorization: `Bearer ${token}` } });
    if (response.status === 401) saveToken(null);
    if (!response.ok) return null;
    return ((await response.json()) as { player: PlayerView }).player;
  } catch {
    return null;
  }
}
