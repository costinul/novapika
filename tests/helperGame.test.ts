import { Vector3 } from 'three';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { HEARD_RATE, MAX_HEARD_BYTES, SOUND_HEAD } from '../shared/helper';
import { FRAME_SPEECH } from '../shared/net';
import { toHeard } from '../src/audio/Ear';
import { VoiceCapture } from '../src/audio/VoiceCapture';
import { PhysicsWorld } from '../src/engine/physics';
import { Helper } from '../src/helper/Helper';
import { Multiplayer } from '../src/net/Multiplayer';
import { Player } from '../src/player/Player';
import { ActionLayer } from '../src/world/actions';
import { WorldState } from '../src/world/WorldState';
import { fakeLobby, settle } from './fakeLobby';
import type { FakeLobby } from './fakeLobby';

// The game's side of the helper parrot: when it listens to the player, and
// what goes to and comes from the lobby. Joined through the real lobby rules
// with no network, and with an ear that hears what the test says.

let physics: PhysicsWorld;
beforeAll(async () => {
  physics = await PhysicsWorld.create();
});

interface Game {
  local: Player;
  parrot: Player;
  net: Multiplayer;
  helper: Helper;
  /** Whether the game has the microphone listened to, as last set. */
  listening: boolean;
  /** The player says something: the ear hands the game a phrase. */
  say(samples: Int16Array): void;
  spoke: number[];
  squawks: number;
}

let lobby: FakeLobby;
let heard: { nickname: string; samples: number[] }[];

function game(id: string, nickname: string, withMicrophone = true): Game {
  const world = new WorldState(physics);
  const local = new Player('local', 'nova');
  world.players.set(local.id, local);
  const parrot = new Player('helper', 'kiki');
  parrot.human = false;
  parrot.head.position.set(0, 1, 0);
  const g: Game = { local, parrot, listening: false, say: () => {}, spoke: [], squawks: 0, net: null!, helper: null! };
  const ear = {
    available: withMicrophone,
    listen: (on: boolean) => void (g.listening = on),
    onPhrase: null as ((samples: Int16Array) => void) | null,
  };
  g.say = (samples) => ear.onPhrase?.(samples);
  g.helper = new Helper({
    local,
    parrot: () => parrot,
    ear,
    context: () => null,
    send: (samples) => g.net.sendHeard(samples),
    onSpeaks: (seconds) => void g.spoke.push(seconds),
    onSquawks: () => void g.squawks++,
  });
  g.net = new Multiplayer({
    world,
    actions: new ActionLayer(world),
    feathers: null,
    local,
    connect: lobby.as(id, nickname),
    about: () => ({ characterId: local.characterId, followerPetId: null }),
    onRefused: () => {},
    helper: g.helper,
  });
  return g;
}

/** Stand the player `distance` in front of the helper parrot, turned `degrees` away from facing it. */
function stand(g: Game, distance: number, degrees = 0): void {
  g.local.head.position.set(0, 1, distance);
  g.local.head.quaternion.setFromAxisAngle(new Vector3(0, 1, 0), (degrees * Math.PI) / 180);
}

const frames = (g: Game, seconds: number): void => {
  for (let t = 0; t < seconds; t += 1 / 60) {
    g.net.frame(1 / 60);
    g.helper.frame(1 / 60);
  }
};

/** The lobby tells a player's game whether the helper parrot is listening. */
const tellListens = (listens: boolean): void => lobby.rules.tellAll({ t: 'helper', listens });

beforeEach(() => {
  lobby = fakeLobby();
  heard = [];
  lobby.onHeard = (member, samples) => void heard.push({ nickname: member.nickname, samples: [...samples] });
});

describe('when the helper parrot listens', () => {
  it('listens only to a player who is close to it and facing it', async () => {
    const sam = game('id-sam', 'Sam');
    sam.net.join('aviary');
    await settle();
    stand(sam, 2);
    frames(sam, 0.1);
    // Not until the lobby has said the helper is listening.
    expect(sam.listening).toBe(false);

    tellListens(true);
    frames(sam, 0.1);
    expect(sam.listening).toBe(true);

    stand(sam, 2, 60);
    frames(sam, 0.1);
    expect(sam.listening).toBe(false);
    stand(sam, 2, 30);
    frames(sam, 0.1);
    expect(sam.listening).toBe(true);

    stand(sam, 5);
    frames(sam, 0.1);
    expect(sam.listening).toBe(false);

    stand(sam, 2);
    tellListens(false);
    frames(sam, 0.1);
    expect(sam.listening).toBe(false);
  });

  it('never listens without a microphone, or once the lobby is left', async () => {
    const mute = game('id-mute', 'Mute', false);
    mute.net.join('aviary');
    await settle();
    tellListens(true);
    stand(mute, 2);
    frames(mute, 0.1);
    expect(mute.listening).toBe(false);

    const sam = game('id-sam', 'Sam');
    sam.net.join('aviary');
    await settle();
    tellListens(true);
    stand(sam, 2);
    frames(sam, 0.1);
    expect(sam.listening).toBe(true);
    sam.net.leave();
    frames(sam, 0.1);
    expect(sam.listening).toBe(false);
  });
});

describe('a phrase said to the helper parrot', () => {
  it('goes to the lobby and to nobody else, and the game waits for the answer', async () => {
    const sam = game('id-sam', 'Sam');
    const alex = game('id-alex', 'Alex');
    sam.net.join('aviary');
    alex.net.join('aviary');
    await settle();
    tellListens(true);
    stand(sam, 2);
    frames(sam, 0.1);

    sam.say(new Int16Array([1, -2, 300]));
    expect(heard).toEqual([{ nickname: 'Sam', samples: [...new Uint8Array(new Int16Array([1, -2, 300]).buffer)] }]);
    // Nothing more is listened to until the answer has come.
    expect(sam.listening).toBe(false);
    frames(sam, 1);
    expect(sam.listening).toBe(false);
    sam.say(new Int16Array([9]));
    expect(heard).toHaveLength(1);

    // The answer: the helper's voice, to everybody.
    const speech = new Uint8Array([FRAME_SPEECH, 0, 7, 7, 7]);
    lobby.rules.sendAll(speech.buffer);
    frames(sam, 0.1);
    expect(sam.listening).toBe(true);
  });

  it('is dropped if the player has turned away by the time it ends', async () => {
    const sam = game('id-sam', 'Sam');
    sam.net.join('aviary');
    await settle();
    tellListens(true);
    stand(sam, 2);
    frames(sam, 0.1);
    stand(sam, 2, 120);
    sam.say(new Int16Array([1, 2, 3]));
    expect(heard).toEqual([]);
  });

  it('is listened for again when the helper could not answer, or never does', async () => {
    const sam = game('id-sam', 'Sam');
    sam.net.join('aviary');
    await settle();
    tellListens(true);
    stand(sam, 2);
    frames(sam, 0.1);

    sam.say(new Int16Array([1]));
    lobby.rules.tellAll({ t: 'squawk' });
    expect(sam.squawks).toBe(1);
    frames(sam, 0.1);
    expect(sam.listening).toBe(true);

    // The lobby says nothing is coming: it was only a cough, or said too soon.
    sam.say(new Int16Array([3]));
    frames(sam, 0.1);
    expect(sam.listening).toBe(false);
    lobby.rules.tellAll({ t: 'helper', listens: true });
    frames(sam, 0.1);
    expect(sam.listening).toBe(true);

    sam.say(new Int16Array([2]));
    frames(sam, 11);
    expect(sam.listening).toBe(false);
    frames(sam, 2);
    expect(sam.listening).toBe(true);
  });
});

describe('the lobby and a phrase', () => {
  it('takes the longest phrase the game can send, and ignores an empty one', async () => {
    const sam = game('id-sam', 'Sam');
    sam.net.join('aviary');
    await settle();
    sam.net.sendHeard(new Int16Array((MAX_HEARD_BYTES - SOUND_HEAD) / 2));
    expect(heard).toHaveLength(1);
    expect(heard[0].samples).toHaveLength(MAX_HEARD_BYTES - SOUND_HEAD);
    sam.net.sendHeard(new Int16Array(0));
    expect(heard).toHaveLength(1);
  });

  it('drops a phrase in a lobby with no helper parrot', async () => {
    lobby.onHeard = null;
    const sam = game('id-sam', 'Sam');
    sam.net.join('test-room');
    await settle();
    sam.net.sendHeard(new Int16Array([1, 2, 3]));
    expect(sam.net.online).toBe(true);
  });
});

describe('a phrase on its way', () => {
  it('is cut to the rate the helper hears at', () => {
    const rate = 48000;
    const second = new Float32Array(rate);
    for (let i = 0; i < rate; i++) second[i] = 0.5 * Math.sin((2 * Math.PI * 440 * i) / rate);
    const out = toHeard(second, rate);
    expect(out).toHaveLength(HEARD_RATE);
    // Still the same tone at the same loudness: the peaks are where they were.
    const peak = Math.max(...out);
    expect(peak / 32767).toBeGreaterThan(0.45);
    expect(peak / 32767).toBeLessThan(0.51);
    let crossings = 0;
    for (let i = 1; i < out.length; i++) if (out[i - 1] < 0 !== out[i] < 0) crossings++;
    expect(Math.abs(crossings - 880)).toBeLessThanOrEqual(2);
  });

  it('never overflows on the loudest sound', () => {
    const out = toHeard(new Float32Array([1, 1, 1, -1, -1, -1, 2, 2, 2, -2, -2, -2]), 48000);
    expect([...out]).toEqual([32767, -32767, 32767, -32768]);
  });

  it('may be longer, and hold a longer pause, than what a mimic repeats', () => {
    const rate = 16000;
    const capture = new VoiceCapture(rate, { maxSeconds: 8, pauseSeconds: 0.8 });
    const block = (level: number): Float32Array => new Float32Array(160).fill(level);
    const feed = (seconds: number, level: number): Float32Array | null => {
      let phrase: Float32Array | null = null;
      for (let i = 0; i < seconds * 100; i++) phrase = capture.feed(block(level)) ?? phrase;
      return phrase;
    };
    // Two seconds of speech, a half-second pause to think, two more: one phrase.
    expect(feed(2, 0.2)).toBeNull();
    expect(feed(0.5, 0)).toBeNull();
    expect(feed(2, 0.2)).toBeNull();
    const phrase = feed(1, 0)!;
    expect(phrase.length / rate).toBeGreaterThan(4.4);
    expect(phrase.length / rate).toBeLessThan(4.8);
    // And never longer than the longest allowed.
    expect(feed(9, 0.2)!.length / rate).toBeLessThanOrEqual(8.01);
  });
});
