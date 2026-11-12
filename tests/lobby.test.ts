import { beforeEach, describe, expect, it } from 'vitest';
import { LobbyRules } from '../server/lobbyRules';
import type { Member } from '../server/lobbyRules';
import type { Action } from '../shared/actions';
import { MAX_HEARD_BYTES, SOUND_HEAD } from '../shared/helper';
import {
  CLOSE_BAD,
  CLOSE_ELSEWHERE,
  CLOSE_FULL,
  FRAME_HEARD,
  FRAME_POSES,
  LOBBY_IDS,
  LOBBY_SIZE,
  MAX_FRAME_BYTES,
} from '../shared/net';
import type { ServerMessage, SharedWorld } from '../shared/net';
import { lobbyRegistry } from '../src/lobbies/registry';

// The lobby's rules, played against connections that only write down what
// they are sent.

interface Conn {
  name: string;
  heard: ServerMessage[];
  frames: Uint8Array[];
  closed: number | null;
  kept: Member | null;
}

let rules: LobbyRules<Conn>;
let clock: number;
/** Every time the lobby kept how its toys stand; null is forgetting it. */
let saves: (SharedWorld | null)[];
const EMPTY: SharedWorld = { holders: [], sims: [], placed: [], rest: [], bells: [], rings: [] };

const conn = (name: string): Conn => ({ name, heard: [], frames: [], closed: null, kept: null });
const join = (name: string): Conn => {
  const c = conn(name);
  rules.join(c, { id: `id-${name}`, nickname: name }, ++clock);
  return c;
};
const me = (characterId: string, followerPetId: string | null = null): string =>
  JSON.stringify({ t: 'me', me: { characterId, followerPetId } });
const frame = (...bytes: number[]): ArrayBuffer => new Uint8Array([FRAME_POSES, 99, ...bytes]).buffer;

beforeEach(() => {
  clock = 0;
  saves = [];
  rules = new LobbyRules<Conn>({
    send: (c, data) => {
      if (typeof data === 'string') c.heard.push(JSON.parse(data));
      else c.frames.push(new Uint8Array(data.slice(0)));
    },
    close: (c, code) => void (c.closed = code),
    keep: (c, member) => void (c.kept = { ...member }),
    save: (world) => void saves.push(world && JSON.parse(JSON.stringify(world))),
  });
});

describe('coming into a lobby', () => {
  it('has a room for every lobby in the game, and no others', () => {
    expect([...LOBBY_IDS].sort()).toEqual(Object.keys(lobbyRegistry).sort());
  });

  it('tells a player who they are and who else is in', () => {
    const alex = join('Alex');
    expect(alex.heard).toEqual([
      {
        t: 'welcome',
        you: 0,
        host: 0,
        players: [{ slot: 0, id: 'id-Alex', nickname: 'Alex', characterId: '', followerPetId: null }],
        world: EMPTY,
      },
    ]);
    const sam = join('Sam');
    const welcome = sam.heard[0] as Extract<ServerMessage, { t: 'welcome' }>;
    expect(welcome.you).toBe(1);
    expect(welcome.host).toBe(0);
    expect(welcome.players.map((p) => p.nickname)).toEqual(['Alex', 'Sam']);
  });

  it('tells the others somebody came in, and what parrot they are', () => {
    const alex = join('Alex');
    const sam = join('Sam');
    expect(alex.heard.at(-1)).toMatchObject({ t: 'player', player: { slot: 1, nickname: 'Sam' } });
    rules.text(sam, me('macaw', 'pet-7'));
    expect(alex.heard.at(-1)).toEqual({
      t: 'player',
      player: { slot: 1, id: 'id-Sam', nickname: 'Sam', characterId: 'macaw', followerPetId: 'pet-7' },
    });
    // Nothing comes back to the one who said it.
    expect(sam.heard).toHaveLength(1);
    // A later arrival hears it in their welcome.
    const kim = join('Kim');
    expect((kim.heard[0] as Extract<ServerMessage, { t: 'welcome' }>).players[1].characterId).toBe('macaw');
  });

  it('is full at eight, and has room again when one leaves', () => {
    const first = Array.from({ length: LOBBY_SIZE }, (_, i) => join(`p${i}`));
    const late = join('late');
    expect(late.closed).toBe(CLOSE_FULL);
    expect(late.heard).toEqual([]);
    expect(rules.players).toHaveLength(LOBBY_SIZE);

    rules.leave(first[3]);
    const next = join('next');
    expect(next.closed).toBeNull();
    // The free place is the one that was given up.
    expect((next.heard[0] as Extract<ServerMessage, { t: 'welcome' }>).you).toBe(3);
  });

  it('lets a player who connects again take over from their old connection', () => {
    const alex = join('Alex');
    const sam = join('Sam');
    const again = join('Sam');
    expect(sam.closed).toBe(CLOSE_ELSEWHERE);
    expect(again.closed).toBeNull();
    expect(rules.players.map((p) => p.nickname)).toEqual(['Alex', 'Sam']);
    expect(alex.heard.slice(-2)).toMatchObject([{ t: 'leave', slot: 1 }, { t: 'player', player: { slot: 1 } }]);
  });
});

describe('leaving a lobby', () => {
  it('tells the others, and passes the lobby on to whoever has been in longest', () => {
    const alex = join('Alex');
    const sam = join('Sam');
    const kim = join('Kim');
    rules.leave(alex);
    expect(sam.heard.slice(-2)).toEqual([{ t: 'leave', slot: 0 }, { t: 'host', slot: 1 }]);
    expect(kim.heard.slice(-2)).toEqual([{ t: 'leave', slot: 0 }, { t: 'host', slot: 1 }]);
    expect(rules.host).toBe(1);

    // Somebody who is not running the lobby leaves: nothing changes hands.
    rules.leave(kim);
    expect(sam.heard.at(-1)).toEqual({ t: 'leave', slot: 2 });
    // A newcomer takes the free place 0, but the one who was in first keeps the lobby.
    const pat = join('Pat');
    expect((pat.heard[0] as Extract<ServerMessage, { t: 'welcome' }>).you).toBe(0);
    expect(rules.host).toBe(1);
  });

  it('is empty, with nobody running it, once everyone has gone', () => {
    const alex = join('Alex');
    rules.leave(alex);
    rules.leave(alex);
    expect(rules.players).toEqual([]);
    expect(rules.host).toBe(-1);
  });
});

describe('passing poses on', () => {
  it('sends a frame to everyone else, marked with who sent it', () => {
    const alex = join('Alex');
    const sam = join('Sam');
    const kim = join('Kim');
    rules.binary(sam, frame(7, 8, 9));
    expect(sam.frames).toEqual([]);
    // Whatever the sender wrote in the second byte, it is their own place.
    expect([...alex.frames[0]]).toEqual([FRAME_POSES, 1, 7, 8, 9]);
    expect([...kim.frames[0]]).toEqual([FRAME_POSES, 1, 7, 8, 9]);
  });

  it('drops a connection that sends something that is not ours', () => {
    const alex = join('Alex');
    for (const bad of [
      () => rules.binary(join('a'), new Uint8Array([9, 0, 1]).buffer),
      () => rules.binary(join('a'), new Uint8Array([FRAME_POSES]).buffer),
      () => rules.binary(join('a'), new Uint8Array(MAX_FRAME_BYTES + 1).fill(FRAME_POSES).buffer),
      () => rules.text(join('a'), 'not json'),
      () => rules.text(join('a'), JSON.stringify({ t: 'welcome' })),
      () => rules.text(join('a'), JSON.stringify({ t: 'me', me: { characterId: 7, followerPetId: null } })),
      () => rules.text(join('a'), me('x'.repeat(41))),
    ]) {
      bad();
      expect(rules.players.map((p) => p.nickname)).toEqual(['Alex']);
    }
    expect(alex.frames).toEqual([]);
    const bad = join('bad');
    rules.text(bad, '[]');
    expect(bad.closed).toBe(CLOSE_BAD);
  });

  it('hears nothing from a connection that never got in', () => {
    const alex = join('Alex');
    const stranger = conn('stranger');
    rules.binary(stranger, frame(1));
    rules.text(stranger, me('macaw'));
    expect(alex.frames).toEqual([]);
    expect(alex.heard).toHaveLength(1);
  });
});

describe('setting up a voice call', () => {
  const rtc = (to: unknown, data: unknown): string => JSON.stringify({ t: 'rtc', to, data });

  it('passes a message to the one player it is for, saying who it is from', () => {
    const alex = join('Alex');
    const sam = join('Sam');
    const kim = join('Kim');
    const heard = [alex, sam, kim].map((c) => c.heard.length);
    rules.text(kim, rtc(0, { sdp: { type: 'offer', sdp: 'v=0' } }));
    expect(alex.heard.at(-1)).toEqual({ t: 'rtc', from: 2, data: { sdp: { type: 'offer', sdp: 'v=0' } } });
    expect([sam, kim].map((c) => c.heard.length)).toEqual(heard.slice(1));
  });

  it('quietly drops a message for somebody who has gone, or for oneself', () => {
    const alex = join('Alex');
    const sam = join('Sam');
    rules.leave(sam);
    const heard = alex.heard.length;
    rules.text(alex, rtc(1, { ice: {} }));
    rules.text(alex, rtc(0, { ice: {} }));
    expect(alex.heard).toHaveLength(heard);
    expect(alex.closed).toBeNull();
  });

  it('drops a connection that sends one that is not ours', () => {
    join('Alex');
    for (const [to, data] of [
      ['0', {}],
      [0.5, {}],
      [0, null],
      [0, 'offer'],
    ]) {
      const bad = join('bad');
      rules.text(bad, rtc(to, data));
      expect(bad.closed).toBe(CLOSE_BAD);
    }
  });
});

describe('toys, bells and rings', () => {
  const act = (c: Conn, action: Action): void => rules.text(c, JSON.stringify({ t: 'act', action }));
  /** The actions a connection has been passed since it came in. */
  const acts = (c: Conn): Action[] => c.heard.flatMap((m) => (m.t === 'act' ? [m.action] : []));
  const welcome = (c: Conn): SharedWorld => (c.heard[0] as Extract<ServerMessage, { t: 'welcome' }>).world;
  const AT = [1, 0.06, 2, 0, 0, 0, 1] as const;

  it('passes what one game makes happen on to the others', () => {
    const alex = join('Alex');
    const sam = join('Sam');
    const kim = join('Kim');
    act(sam, { type: 'ring', objectId: 'bell-1', playerId: 'id-Sam' });
    expect(acts(alex)).toEqual([{ type: 'ring', objectId: 'bell-1', playerId: 'id-Sam' }]);
    expect(acts(kim)).toEqual(acts(alex));
    expect(acts(sam)).toEqual([]);
  });

  it('gives a toy two players bite at once to whoever was first, and tells the other', () => {
    const alex = join('Alex');
    const sam = join('Sam');
    act(alex, { type: 'pickUp', playerId: 'id-Alex', toyId: 'seed' });
    act(sam, { type: 'pickUp', playerId: 'id-Sam', toyId: 'seed' });
    expect(acts(sam)).toEqual([{ type: 'pickUp', playerId: 'id-Alex', toyId: 'seed' }]);
    expect(acts(alex)).toEqual([]);
    expect(sam.heard.at(-1)).toEqual({ t: 'held', toyId: 'seed', by: 'id-Alex', at: null });
    // Nor may a parrot that carries one toy pick up another.
    act(alex, { type: 'pickUp', playerId: 'id-Alex', toyId: 'block' });
    expect(acts(sam)).toHaveLength(1);
    expect(alex.heard.at(-1)).toEqual({ t: 'held', toyId: 'block', by: null, at: null });
  });

  it('lets a toy be taken from a beak, but not from nobody or oneself', () => {
    const alex = join('Alex');
    const sam = join('Sam');
    act(sam, { type: 'take', playerId: 'id-Sam', toyId: 'seed' });
    expect(acts(alex)).toEqual([]);
    act(alex, { type: 'pickUp', playerId: 'id-Alex', toyId: 'seed' });
    act(alex, { type: 'take', playerId: 'id-Alex', toyId: 'seed' });
    act(sam, { type: 'take', playerId: 'id-Sam', toyId: 'seed' });
    expect(acts(alex)).toEqual([{ type: 'take', playerId: 'id-Sam', toyId: 'seed' }]);
    // What was taken can no longer be dropped by the one it was taken from.
    act(alex, { type: 'drop', playerId: 'id-Alex' });
    expect(acts(sam)).toHaveLength(1);
    act(sam, { type: 'drop', playerId: 'id-Sam' });
    expect(acts(alex).at(-1)).toEqual({ type: 'drop', playerId: 'id-Sam' });
  });

  it('lets a game speak only for its own player, and the host\'s also for the lobby\'s parrots', () => {
    const alex = join('Alex');
    const sam = join('Sam');
    act(sam, { type: 'pickUp', playerId: 'id-Alex', toyId: 'seed' });
    act(sam, { type: 'pickUp', playerId: 'flock-budgie-1', toyId: 'seed' });
    act(sam, { type: 'stunt', playerId: 'id-Alex', name: 'loop' });
    expect(acts(alex)).toEqual([]);
    act(alex, { type: 'pickUp', playerId: 'flock-budgie-1', toyId: 'seed' });
    expect(acts(sam)).toEqual([{ type: 'pickUp', playerId: 'flock-budgie-1', toyId: 'seed' }]);
    // The host cannot speak for another player either.
    act(alex, { type: 'drop', playerId: 'id-Sam' });
    expect(acts(sam)).toHaveLength(1);
  });

  it('has a dropped toy moved by the game that dropped it, until that game says it is at rest', () => {
    const alex = join('Alex');
    const sam = join('Sam');
    const kim = join('Kim');
    act(sam, { type: 'pickUp', playerId: 'id-Sam', toyId: 'block' });
    act(sam, { type: 'drop', playerId: 'id-Sam' });
    // Nobody else may say where it came to rest, where it was put, or send it home: not even the host.
    act(kim, { type: 'rest', toyId: 'block', at: AT });
    act(alex, { type: 'place', toyId: 'block', targetId: 'toy-box' });
    act(alex, { type: 'home', toyId: 'block' });
    act(kim, { type: 'claim', toyId: 'block', playerId: 'id-Kim' });
    expect(acts(sam)).toEqual([]);

    act(sam, { type: 'place', toyId: 'block', targetId: 'toy-box' });
    act(sam, { type: 'rest', toyId: 'block', at: AT });
    expect(acts(alex).slice(-2)).toEqual([
      { type: 'place', toyId: 'block', targetId: 'toy-box' },
      { type: 'rest', toyId: 'block', at: AT },
    ]);
    // Lying still, it is the host's to answer for.
    act(sam, { type: 'home', toyId: 'block' });
    expect(acts(alex)).toHaveLength(4);
    act(alex, { type: 'home', toyId: 'block' });
    expect(acts(sam).at(-1)).toEqual({ type: 'home', toyId: 'block' });
  });

  it('lets one game take over a toy that was knocked, and only one', () => {
    const alex = join('Alex');
    const sam = join('Sam');
    act(sam, { type: 'claim', toyId: 'ball', playerId: 'id-Sam' });
    act(alex, { type: 'claim', toyId: 'ball', playerId: 'id-Alex' });
    expect(acts(alex)).toEqual([{ type: 'claim', toyId: 'ball', playerId: 'id-Sam' }]);
    expect(acts(sam)).toEqual([]);
    // A carried toy is nobody's to take over.
    act(alex, { type: 'pickUp', playerId: 'id-Alex', toyId: 'seed' });
    act(sam, { type: 'claim', toyId: 'seed', playerId: 'id-Sam' });
    expect(acts(alex)).toHaveLength(1);
  });

  it('tells a newcomer how everything stands', () => {
    const alex = join('Alex');
    const sam = join('Sam');
    act(alex, { type: 'pickUp', playerId: 'id-Alex', toyId: 'seed' });
    act(sam, { type: 'pickUp', playerId: 'id-Sam', toyId: 'block' });
    act(sam, { type: 'drop', playerId: 'id-Sam' });
    act(sam, { type: 'claim', toyId: 'ball', playerId: 'id-Sam' });
    act(sam, { type: 'place', toyId: 'ball', targetId: 'toy-box' });
    act(sam, { type: 'rest', toyId: 'ball', at: AT });
    act(alex, { type: 'ring', objectId: 'bell-1', playerId: 'id-Alex' });
    act(alex, { type: 'passRing', ringId: 'ring-1', playerId: 'id-Alex' });
    act(alex, { type: 'passRing', ringId: 'ring-2', playerId: 'id-Alex' });
    act(sam, { type: 'celebrate', what: 'rings' });

    expect(welcome(join('Kim'))).toEqual({
      holders: [['seed', 'id-Alex']],
      sims: [['block', 'id-Sam']],
      placed: [['ball', 'toy-box']],
      rest: [['ball', AT]],
      bells: ['bell-1'],
      rings: [],
    });
  });

  it('sends home what a player carried, and what their game was moving, when they leave', () => {
    const alex = join('Alex');
    const sam = join('Sam');
    act(sam, { type: 'pickUp', playerId: 'id-Sam', toyId: 'block' });
    act(sam, { type: 'drop', playerId: 'id-Sam' });
    act(sam, { type: 'pickUp', playerId: 'id-Sam', toyId: 'seed' });
    // The host's lobby parrot carries one too: that stays where it is.
    act(alex, { type: 'pickUp', playerId: 'flock-budgie-1', toyId: 'ball' });
    const before = alex.heard.length;
    rules.leave(sam);
    expect(alex.heard.slice(before)).toEqual([
      { t: 'act', action: { type: 'home', toyId: 'seed' } },
      { t: 'act', action: { type: 'home', toyId: 'block' } },
      { t: 'leave', slot: 1 },
    ]);
    expect(welcome(join('Kim'))).toEqual({ ...EMPTY, holders: [['ball', 'flock-budgie-1']] });
  });

  it('starts afresh once everyone has gone', () => {
    const alex = join('Alex');
    act(alex, { type: 'ring', objectId: 'bell-1', playerId: 'id-Alex' });
    act(alex, { type: 'pickUp', playerId: 'flock-budgie-1', toyId: 'ball' });
    rules.leave(alex);
    expect(saves.at(-1)).toBeNull();
    expect(welcome(join('Sam'))).toEqual(EMPTY);
  });

  it('keeps how things stand whenever that changes, and not otherwise', () => {
    const alex = join('Alex');
    join('Sam');
    act(alex, { type: 'ring', objectId: 'bell-1', playerId: 'id-Alex' });
    expect(saves).toEqual([{ ...EMPTY, bells: ['bell-1'] }]);
    act(alex, { type: 'ring', objectId: 'bell-1', playerId: 'id-Alex' });
    act(alex, { type: 'stunt', playerId: 'id-Alex', name: 'loop' });
    act(alex, { type: 'splash', waterId: 'bath', playerId: 'id-Alex' });
    act(alex, { type: 'drop', playerId: 'id-Alex' });
    expect(saves).toHaveLength(1);
    act(alex, { type: 'pickUp', playerId: 'id-Alex', toyId: 'seed' });
    expect(saves).toHaveLength(2);
    expect(saves[1]!.holders).toEqual([['seed', 'id-Alex']]);
  });

  it('drops a connection that sends an action that is not one', () => {
    join('Alex');
    for (const action of [
      null,
      { type: 'explode' },
      { type: 'pickUp', playerId: 'id-bad' },
      { type: 'rest', toyId: 'block', at: [1, 2, 3] },
      { type: 'rest', toyId: 'block', at: [1, 2, 3, 0, 0, 0, 'x'] },
      { type: 'celebrate', what: 'everything' },
      { type: 'ring', objectId: 'x'.repeat(65), playerId: 'id-bad' },
    ]) {
      const bad = join('bad');
      rules.text(bad, JSON.stringify({ t: 'act', action }));
      expect(bad.closed, JSON.stringify(action)).toBe(CLOSE_BAD);
    }
  });
});

describe('waking up', () => {
  it('knows everyone again from what was kept with each connection', () => {
    const alex = join('Alex');
    const sam = join('Sam');
    rules.text(sam, me('macaw'));
    const kept = [alex, sam].map((c): [Conn, Member] => [c, c.kept!]);

    rules.text(alex, JSON.stringify({ t: 'act', action: { type: 'pickUp', playerId: 'id-Alex', toyId: 'seed' } }));

    // The lobby went to sleep and lost its memory; the connections stayed open.
    const before = rules.players;
    rules = new LobbyRules<Conn>({
      send: (c, data) => void (typeof data === 'string' ? c.heard.push(JSON.parse(data)) : c.frames.push(new Uint8Array(data))),
      close: (c, code) => void (c.closed = code),
      keep: (c, member) => void (c.kept = { ...member }),
    });
    for (const [c, member] of kept) rules.restore(c, member);
    rules.restoreWorld(saves.at(-1)!);
    expect(rules.players).toEqual(before);
    // It still knows who carries what: the toy cannot be picked up twice.
    rules.text(sam, JSON.stringify({ t: 'act', action: { type: 'pickUp', playerId: 'id-Sam', toyId: 'seed' } }));
    expect(sam.heard.at(-1)).toEqual({ t: 'held', toyId: 'seed', by: 'id-Alex', at: null });
    expect(rules.host).toBe(0);
    rules.binary(alex, frame(5));
    expect([...sam.frames.at(-1)!]).toEqual([FRAME_POSES, 0, 5]);
  });
});

describe('a phrase for the helper parrot', () => {
  /** What the helper was given: who said it, and the samples. */
  let heard: [string, number[]][];
  const phrase = (...samples: number[]): ArrayBuffer => new Uint8Array([FRAME_HEARD, 0, ...samples]).buffer;

  beforeEach(() => {
    heard = [];
    rules = new LobbyRules<Conn>({
      send: (c, data) => {
        if (typeof data === 'string') c.heard.push(JSON.parse(data));
        else c.frames.push(new Uint8Array(data.slice(0)));
      },
      close: (c, code) => void (c.closed = code),
      keep: () => {},
      heard: (_c, member, samples) => void heard.push([member.nickname, [...samples]]),
    });
  });

  it('goes to the helper, and is passed on to nobody', () => {
    const alex = join('Alex');
    const sam = join('Sam');
    rules.binary(sam, phrase(5, 6, 7, 8));
    expect(heard).toEqual([['Sam', [5, 6, 7, 8]]]);
    expect(alex.frames).toEqual([]);
    expect(sam.frames).toEqual([]);
    expect(sam.closed).toBeNull();
  });

  it('may be as long as the helper listens for, and no longer', () => {
    const sam = join('Sam');
    const longest = new Uint8Array(MAX_HEARD_BYTES);
    longest[0] = FRAME_HEARD;
    rules.binary(sam, longest.buffer);
    expect(heard).toHaveLength(1);
    expect(heard[0][1]).toHaveLength(MAX_HEARD_BYTES - SOUND_HEAD);
    expect(sam.closed).toBeNull();

    const tooLong = new Uint8Array(MAX_HEARD_BYTES + 1);
    tooLong[0] = FRAME_HEARD;
    rules.binary(sam, tooLong.buffer);
    expect(heard).toHaveLength(1);
    expect(sam.closed).toBe(CLOSE_BAD);
  });

  it('is not given to the helper when it is empty, or from somebody who is not in', () => {
    const sam = join('Sam');
    rules.binary(sam, phrase());
    rules.binary(conn('stranger'), phrase(1, 2));
    expect(heard).toEqual([]);
    expect(sam.closed).toBeNull();
  });

  it('lets the helper answer everybody, or one player', () => {
    const alex = join('Alex');
    const sam = join('Sam');
    alex.heard.length = sam.heard.length = 0;
    rules.sendAll(new Uint8Array([3, 0, 9, 9]).buffer);
    expect(alex.frames).toEqual([new Uint8Array([3, 0, 9, 9])]);
    expect(sam.frames).toEqual([new Uint8Array([3, 0, 9, 9])]);
    rules.tellAll({ t: 'squawk' });
    rules.tell(sam, { t: 'helper', listens: false });
    expect(alex.heard).toEqual([{ t: 'squawk' }]);
    expect(sam.heard).toEqual([{ t: 'squawk' }, { t: 'helper', listens: false }]);
  });
});

describe('a lobby with no helper parrot', () => {
  it('drops a phrase and carries on', () => {
    const alex = join('Alex');
    const sam = join('Sam');
    rules.binary(sam, new Uint8Array([FRAME_HEARD, 0, 1, 2]).buffer);
    expect(sam.closed).toBeNull();
    expect(alex.frames).toEqual([]);
  });
});
