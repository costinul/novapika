import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlayerView } from '../shared/api';
import { savedToken, signedInPlayer, signIn } from '../src/account/account';

const alex: PlayerView = { id: 'p1', nickname: 'Alex', followerId: null, pets: [] };

/** What the server would answer; each test sets it. */
let answer: (url: string, init?: RequestInit) => Response | Promise<Response>;
let kept: Map<string, string>;
let calls: { url: string; init?: RequestInit }[];

beforeEach(() => {
  kept = new Map();
  calls = [];
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => kept.get(key) ?? null,
    setItem: (key: string, value: string) => void kept.set(key, value),
    removeItem: (key: string) => void kept.delete(key),
  });
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return answer(url, init);
  });
});

afterEach(() => vi.unstubAllGlobals());

describe('signing in on the headset', () => {
  it('sends the code and keeps the token it gets back', async () => {
    answer = () => Response.json({ token: 'secret-token', player: alex });
    const result = await signIn('123456');
    expect(result).toEqual({ ok: true, player: alex });
    expect(calls[0].url).toBe('/api/login');
    expect(calls[0].init?.method).toBe('POST');
    expect(JSON.parse(calls[0].init?.body as string)).toEqual({ code: '123456' });
    expect(savedToken()).toBe('secret-token');
    // The code itself is never kept.
    expect([...kept.values()].join()).not.toContain('123456');
  });

  it('tells a wrong code, too many tries and no connection apart', async () => {
    answer = () => Response.json({ error: 'bad-code' }, { status: 401 });
    expect(await signIn('000000')).toEqual({ ok: false, why: 'bad-code' });
    answer = () => Response.json({ error: 'slow-down' }, { status: 429 });
    expect(await signIn('000000')).toEqual({ ok: false, why: 'slow-down' });
    answer = () => new Response('oops', { status: 500 });
    expect(await signIn('000000')).toEqual({ ok: false, why: 'offline' });
    answer = () => {
      throw new TypeError('network down');
    };
    expect(await signIn('000000')).toEqual({ ok: false, why: 'offline' });
    expect(savedToken()).toBeNull();
  });

  it('counts a page that is not the API as no connection', async () => {
    // A plain file host answers every address with the game's own page.
    answer = () => new Response('<!doctype html>', { status: 200 });
    expect(await signIn('123456')).toEqual({ ok: false, why: 'offline' });
    expect(savedToken()).toBeNull();
  });
});

describe('coming back signed in', () => {
  it('asks nobody when no token is kept', async () => {
    expect(await signedInPlayer()).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it('finds the player with the kept token', async () => {
    kept.set('novapika.token', 'secret-token');
    answer = () => Response.json({ player: alex });
    expect(await signedInPlayer()).toEqual(alex);
    expect(calls[0].url).toBe('/api/me');
    expect(new Headers(calls[0].init?.headers).get('Authorization')).toBe('Bearer secret-token');
  });

  it('drops a token the server no longer takes', async () => {
    kept.set('novapika.token', 'old-token');
    answer = () => Response.json({ error: 'signed-out' }, { status: 401 });
    expect(await signedInPlayer()).toBeNull();
    expect(savedToken()).toBeNull();
  });

  it('keeps the token when the server cannot be reached', async () => {
    kept.set('novapika.token', 'secret-token');
    answer = () => {
      throw new TypeError('network down');
    };
    expect(await signedInPlayer()).toBeNull();
    expect(savedToken()).toBe('secret-token');
    answer = () => new Response('oops', { status: 503 });
    expect(await signedInPlayer()).toBeNull();
    expect(savedToken()).toBe('secret-token');
  });

  it('plays signed out when storage is switched off', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    });
    expect(savedToken()).toBeNull();
    expect(await signedInPlayer()).toBeNull();
    answer = () => Response.json({ token: 'secret-token', player: alex });
    expect(await signIn('123456')).toEqual({ ok: true, player: alex });
  });
});
