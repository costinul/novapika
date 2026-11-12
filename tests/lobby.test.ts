import { beforeEach, describe, expect, it } from 'vitest';
import { LobbyRules } from '../server/lobbyRules';
import type { Member } from '../server/lobbyRules';
import { CLOSE_BAD, CLOSE_ELSEWHERE, CLOSE_FULL, FRAME_POSES, LOBBY_IDS, LOBBY_SIZE, MAX_FRAME_BYTES } from '../shared/net';
import type { ServerMessage } from '../shared/net';
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
  rules = new LobbyRules<Conn>({
    send: (c, data) => {
      if (typeof data === 'string') c.heard.push(JSON.parse(data));
      else c.frames.push(new Uint8Array(data.slice(0)));
    },
    close: (c, code) => void (c.closed = code),
    keep: (c, member) => void (c.kept = { ...member }),
  });
});

describe('coming into a lobby', () => {
  it('has a room for every lobby in the game, and no others', () => {
    expect([...LOBBY_IDS].sort()).toEqual(Object.keys(lobbyRegistry).sort());
  });

  it('tells a player who they are and who else is in', () => {
    const alex = join('Alex');
    expect(alex.heard).toEqual([
      { t: 'welcome', you: 0, host: 0, players: [{ slot: 0, id: 'id-Alex', nickname: 'Alex', characterId: '', followerPetId: null }] },
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

describe('waking up', () => {
  it('knows everyone again from what was kept with each connection', () => {
    const alex = join('Alex');
    const sam = join('Sam');
    rules.text(sam, me('macaw'));
    const kept = [alex, sam].map((c): [Conn, Member] => [c, c.kept!]);

    // The lobby went to sleep and lost its memory; the connections stayed open.
    const before = rules.players;
    rules = new LobbyRules<Conn>({
      send: (c, data) => void (typeof data === 'string' ? c.heard.push(JSON.parse(data)) : c.frames.push(new Uint8Array(data))),
      close: (c, code) => void (c.closed = code),
      keep: (c, member) => void (c.kept = { ...member }),
    });
    for (const [c, member] of kept) rules.restore(c, member);
    expect(rules.players).toEqual(before);
    expect(rules.host).toBe(0);
    rules.binary(alex, frame(5));
    expect([...sam.frames.at(-1)!]).toEqual([FRAME_POSES, 0, 5]);
  });
});
