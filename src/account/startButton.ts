import type { Account } from './account';

/** What the round button on the start screen shows. */
export type StartState = 'loading' | 'locked' | 'offline' | 'none' | 'ready';

/**
 * Nobody plays without signing in. `account` is null until the server has
 * said who this device is, and `vr` until the game has loaded.
 */
export function startButton(vr: boolean | null, account: Account | null): { state: StartState; label: string } {
  if (account === null) return { state: 'loading', label: 'Loading' };
  if (account.status === 'out') return { state: 'locked', label: 'Sign in to play' };
  if (account.status === 'offline') return { state: 'offline', label: 'No connection. Try again' };
  if (vr === null) return { state: 'loading', label: 'Loading' };
  if (!vr) return { state: 'none', label: 'VR is not available in this browser' };
  return { state: 'ready', label: 'Play' };
}
