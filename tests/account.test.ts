import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlayerView } from '../shared/api';
import { loadAccount, petsApi, savedToken, signIn } from '../src/account/account';
import type { Account } from '../src/account/account';
import { startButton } from '../src/account/startButton';

const alex: PlayerView = { id: 'p1', nickname: 'Alex', followerId: null, pets: [], egg: null, asking: null, asked: [] };

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
    expect(await loadAccount()).toEqual({ status: 'out' });
    expect(calls).toHaveLength(0);
  });

  it('finds the player with the kept token', async () => {
    kept.set('novapika.token', 'secret-token');
    answer = () => Response.json({ player: alex });
    expect(await loadAccount()).toEqual({ status: 'in', player: alex });
    expect(calls[0].url).toBe('/api/me');
    expect(new Headers(calls[0].init?.headers).get('Authorization')).toBe('Bearer secret-token');
  });

  it('drops a token the server no longer takes', async () => {
    kept.set('novapika.token', 'old-token');
    answer = () => Response.json({ error: 'signed-out' }, { status: 401 });
    expect(await loadAccount()).toEqual({ status: 'out' });
    expect(savedToken()).toBeNull();
  });

  it('keeps the token when the server cannot be reached', async () => {
    kept.set('novapika.token', 'secret-token');
    answer = () => {
      throw new TypeError('network down');
    };
    expect(await loadAccount()).toEqual({ status: 'offline' });
    expect(savedToken()).toBe('secret-token');
    answer = () => new Response('oops', { status: 503 });
    expect(await loadAccount()).toEqual({ status: 'offline' });
    // A plain file host answers with the game's own page, not the API.
    answer = () => new Response('<!doctype html>', { status: 200 });
    expect(await loadAccount()).toEqual({ status: 'offline' });
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
    expect(await loadAccount()).toEqual({ status: 'out' });
    answer = () => Response.json({ token: 'secret-token', player: alex });
    expect(await signIn('123456')).toEqual({ ok: true, player: alex });
  });
});

describe('asking for a pet to follow', () => {
  it('sends the pet with the token and gives back the player as the server has them', async () => {
    kept.set('novapika.token', 'secret-token');
    const after = { ...alex, followerId: 'pet-2' };
    answer = () => Response.json({ player: after });
    expect(await petsApi.follow('pet-2')).toEqual(after);
    expect(calls[0].url).toBe('/api/me/follower');
    expect(calls[0].init?.method).toBe('POST');
    expect(JSON.parse(calls[0].init?.body as string)).toEqual({ petId: 'pet-2' });
    expect(new Headers(calls[0].init?.headers).get('Authorization')).toBe('Bearer secret-token');
  });

  it('gives nothing when the server refuses or cannot be reached, or nobody is signed in', async () => {
    answer = () => Response.json({ player: alex });
    expect(await petsApi.follow('pet-2')).toBeNull();
    expect(calls).toHaveLength(0);

    kept.set('novapika.token', 'secret-token');
    answer = () => Response.json({ error: 'no-such-pet' }, { status: 404 });
    expect(await petsApi.follow('pet-2')).toBeNull();
    answer = () => {
      throw new TypeError('network down');
    };
    expect(await petsApi.follow('pet-2')).toBeNull();
  });
});

describe('everything else the game asks the server', () => {
  beforeEach(() => {
    kept.set('novapika.token', 'secret-token');
    answer = () => Response.json({ player: alex, friends: [], hatched: null });
  });
  /** The last call made: how, where, and with what. */
  const last = (): [string, string, unknown] => {
    const { url, init } = calls[calls.length - 1];
    return [init?.method ?? 'GET', url, init?.body ? JSON.parse(init.body as string) : undefined];
  };

  it('asks for the right thing at the right address', async () => {
    expect(await petsApi.friends()).toEqual([]);
    expect(last()).toEqual(['GET', '/api/friends', undefined]);
    expect(await petsApi.breed('a', 'b')).toEqual(alex);
    expect(last()).toEqual(['POST', '/api/breed', { petA: 'a', petB: 'b' }]);
    expect(await petsApi.ask('mine', 'theirs')).toEqual(alex);
    expect(last()).toEqual(['POST', '/api/requests', { myPetId: 'mine', theirPetId: 'theirs' }]);
    expect(await petsApi.answer('r1', true)).toEqual(alex);
    expect(last()).toEqual(['POST', '/api/requests/r1', { accept: true }]);
    expect(await petsApi.cancel('r1')).toEqual(alex);
    expect(last()).toEqual(['DELETE', '/api/requests/r1', undefined]);
    expect(await petsApi.feed()).toEqual({ player: alex, friends: [], hatched: null });
    expect(last()[1]).toBe('/api/egg/feed');
    expect(await petsApi.free('pet-9')).toEqual(alex);
    expect(last().slice(0, 2)).toEqual(['POST', '/api/pets/pet-9/free']);
    expect(await petsApi.account()).toEqual({ status: 'in', player: alex });
    // Every one of them is the signed-in player's own call.
    for (const { init } of calls) expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer secret-token');
  });

  it('gives nothing for any of them when the server refuses', async () => {
    answer = () => Response.json({ error: 'full' }, { status: 409 });
    expect(await petsApi.friends()).toBeNull();
    expect(await petsApi.breed('a', 'b')).toBeNull();
    expect(await petsApi.ask('mine', 'theirs')).toBeNull();
    expect(await petsApi.answer('r1', false)).toBeNull();
    expect(await petsApi.cancel('r1')).toBeNull();
    expect(await petsApi.feed()).toBeNull();
    expect(await petsApi.free('pet-9')).toBeNull();
  });
});

describe('the play button on the start screen', () => {
  const signedIn: Account = { status: 'in', player: alex };

  it('waits until the server has said who this device is', () => {
    expect(startButton(true, null).state).toBe('loading');
    expect(startButton(null, null).state).toBe('loading');
  });

  it('asks for the code when nobody is signed in, even while the game loads', () => {
    expect(startButton(null, { status: 'out' }).state).toBe('locked');
    expect(startButton(true, { status: 'out' }).state).toBe('locked');
    expect(startButton(false, { status: 'out' }).state).toBe('locked');
  });

  it('does not let anyone play with no connection', () => {
    expect(startButton(true, { status: 'offline' }).state).toBe('offline');
  });

  it('lets a signed-in player in once the game has loaded', () => {
    expect(startButton(null, signedIn).state).toBe('loading');
    expect(startButton(true, signedIn)).toEqual({ state: 'ready', label: 'Play' });
    expect(startButton(false, signedIn).state).toBe('none');
  });
});
