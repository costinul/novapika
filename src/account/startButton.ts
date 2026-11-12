import type { Account } from './account';

/** What the round button on the start screen shows. */
export type StartState = 'loading' | 'locked' | 'offline' | 'none' | 'microphone' | 'ready';

/**
 * Nobody plays without signing in. `account` is null until the server has
 * said who this device is, and `vr` until the game has loaded.
 *
 * `askMicrophone` is true while the browser has still to ask whether the game
 * may use the microphone. It asks on the flat page, where its question can be
 * seen and answered, so the button asks first and only then turns to Play: a
 * question that came up as VR started would be lost, and nobody would be heard.
 */
export function startButton(vr: boolean | null, account: Account | null, askMicrophone = false): { state: StartState; label: string } {
  if (account === null) return { state: 'loading', label: 'Loading' };
  if (account.status === 'out') return { state: 'locked', label: 'Sign in to play' };
  if (account.status === 'offline') return { state: 'offline', label: 'No connection. Try again' };
  if (vr === null) return { state: 'loading', label: 'Loading' };
  if (!vr) return { state: 'none', label: 'VR is not available in this browser' };
  if (askMicrophone) return { state: 'microphone', label: 'Allow the microphone, to talk in the game' };
  return { state: 'ready', label: 'Play' };
}
