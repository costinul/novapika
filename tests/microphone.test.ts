import { afterEach, describe, expect, it, vi } from 'vitest';
import { Microphone, watchMicrophone } from '../src/audio/Microphone';
import type { MicrophoneAccess } from '../src/audio/Microphone';

// Asking the browser for the microphone, against a browser that answers as
// the test says.

afterEach(() => {
  vi.unstubAllGlobals();
});

/** A browser whose answers to "may I use the microphone?" are taken from `answers`, in order. */
function browser(answers: (object | Error)[]): { asks: number } {
  const state = { asks: 0 };
  vi.stubGlobal('navigator', {
    mediaDevices: {
      getUserMedia: async () => {
        const answer = answers[state.asks++];
        if (answer instanceof Error) throw answer;
        return answer;
      },
    },
  });
  return state;
}

describe('the microphone', () => {
  it('is asked for once, and then shared', async () => {
    const stream = { id: 'mic' };
    const state = browser([stream]);
    const microphone = new Microphone();
    // Two things want it at the same moment: the browser is asked once.
    const [a, b] = await Promise.all([microphone.open(), microphone.open()]);
    expect(a).toBe(stream);
    expect(b).toBe(stream);
    expect(await microphone.open()).toBe(stream);
    expect(state.asks).toBe(1);
  });

  it('is asked for again after it was refused or the question went unanswered', async () => {
    const stream = { id: 'mic' };
    const state = browser([new Error('NotAllowedError'), stream]);
    const microphone = new Microphone();
    expect(await microphone.open()).toBeNull();
    // The next press of the play button asks afresh, and this time it is given.
    expect(await microphone.open()).toBe(stream);
    expect(await microphone.open()).toBe(stream);
    expect(state.asks).toBe(2);
  });

  it('is simply not there in a browser that has none', async () => {
    vi.stubGlobal('navigator', {});
    expect(await new Microphone().open()).toBeNull();
  });
});

describe('what the browser says about the microphone', () => {
  it('is told at once, and again when the player answers the question', async () => {
    const status: { state: MicrophoneAccess; onchange: (() => void) | null } = { state: 'prompt', onchange: null };
    vi.stubGlobal('navigator', { permissions: { query: async () => status } });
    const told: MicrophoneAccess[] = [];
    await watchMicrophone((access) => told.push(access));
    expect(told).toEqual(['prompt']);
    status.state = 'granted';
    status.onchange?.();
    expect(told).toEqual(['prompt', 'granted']);
  });

  it('is unknown in a browser that will not say', async () => {
    vi.stubGlobal('navigator', {
      permissions: {
        query: async () => {
          throw new TypeError('microphone is not a permission name');
        },
      },
    });
    const told: MicrophoneAccess[] = [];
    await watchMicrophone((access) => told.push(access));
    expect(told).toEqual(['unknown']);

    vi.stubGlobal('navigator', {});
    await watchMicrophone((access) => told.push(access));
    expect(told).toEqual(['unknown', 'unknown']);
  });
});
