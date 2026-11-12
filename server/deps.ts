import type { Deps } from './rules';

/** What the rules need from outside, for real: the clock, and numbers nobody can predict. */
export const deps: Deps = {
  now: () => Date.now(),
  random: () => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32,
  id: () => crypto.randomUUID(),
  token: () => Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, '0')).join(''),
};
