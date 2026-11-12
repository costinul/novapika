import { beforeEach, describe, expect, it } from 'vitest';
import type { RtcData } from '../shared/net';
import { Voice } from '../src/voice/Voice';

// Setting up voice calls between games, with made-up connections that only
// follow WebRTC's rules about what may happen in what order.

interface Description {
  type: 'offer' | 'answer';
  sdp: string;
}

interface Line {
  direction: string;
  sender: { track: unknown; replaceTrack(track: unknown): Promise<void> };
}

class FakePeer {
  static made: FakePeer[] = [];
  localDescription: Description | null = null;
  remoteDescription: Description | null = null;
  connectionState = 'new';
  closed = false;
  onicecandidate: ((event: { candidate: { toJSON(): object } | null }) => void) | null = null;
  ontrack: unknown = null;
  onconnectionstatechange: (() => void) | null = null;
  readonly reached: object[] = [];
  private readonly lines: Line[] = [];

  constructor(
    readonly owner: number,
    readonly config: RTCConfiguration,
  ) {
    FakePeer.made.push(this);
  }

  private line(direction: string): Line {
    const sender = {
      track: null as unknown,
      replaceTrack: async (track: unknown) => void (sender.track = track),
    };
    const line = { direction, sender };
    this.lines.push(line);
    return line;
  }

  addTransceiver(_kind: string, init: { direction: string }): Line {
    return this.line(init.direction);
  }

  getTransceivers(): Line[] {
    return this.lines;
  }

  async createOffer(): Promise<Description> {
    return { type: 'offer', sdp: `offer with ${this.lines.length} line` };
  }

  async createAnswer(): Promise<Description> {
    if (this.remoteDescription?.type !== 'offer') throw new Error('nothing to answer');
    return { type: 'answer', sdp: `answer, ${this.lines[0].direction}` };
  }

  async setLocalDescription(description: Description): Promise<void> {
    this.localDescription = description;
    // A way to reach this side turns up a moment later.
    queueMicrotask(() => this.onicecandidate?.({ candidate: { toJSON: () => ({ candidate: `via ${description.type}` }) } }));
    this.settle();
  }

  async setRemoteDescription(description: Description): Promise<void> {
    if (description.type === 'answer' && this.localDescription?.type !== 'offer') throw new Error('no offer to answer');
    this.remoteDescription = description;
    // An offer brings its one line of sound with it, receiving only until told otherwise.
    if (description.type === 'offer') this.line('recvonly');
    this.settle();
  }

  async addIceCandidate(candidate: object): Promise<void> {
    if (!this.remoteDescription) throw new Error('too early');
    this.reached.push(candidate);
  }

  close(): void {
    this.closed = true;
    this.connectionState = 'closed';
  }

  fail(): void {
    this.connectionState = 'failed';
    this.onconnectionstatechange?.();
  }

  get sending(): unknown {
    return this.lines[0]?.sender.track ?? null;
  }

  private settle(): void {
    if (this.localDescription && this.remoteDescription) this.connectionState = 'connected';
  }
}

const settle = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) await new Promise((done) => setTimeout(done, 0));
};
const microphone = (name: string): MediaStream => ({ getAudioTracks: () => [name] }) as unknown as MediaStream;

/** Three games' voices, each message carried to the one it is for. */
let voices: Voice[];
let sent: { from: number; to: number; data: RtcData }[];
/** Hold messages back, to deliver them out of step. */
let held: (() => void)[] | null;
const peersOf = (owner: number): FakePeer[] => FakePeer.made.filter((peer) => peer.owner === owner);

beforeEach(() => {
  FakePeer.made = [];
  sent = [];
  held = null;
  voices = [0, 1, 2].map(
    (from) =>
      new Voice({
        context: () => null,
        iceServers: async () => [{ urls: 'stun:example.test' }],
        newPeer: (config) => new FakePeer(from, config) as unknown as RTCPeerConnection,
        send: (to, data) => {
          sent.push({ from, to, data });
          const deliver = (): void => voices[to].signal(from, JSON.parse(JSON.stringify(data)));
          if (held) held.push(deliver);
          else queueMicrotask(deliver);
        },
      }),
  );
});

describe('a voice call between two players', () => {
  it('is rung by one, answered by the other, and connects', async () => {
    voices[0].call(1);
    await settle();
    expect(voices[0].states()).toEqual({ 1: 'connected' });
    expect(voices[1].states()).toEqual({ 0: 'connected' });
    expect(sent.filter((m) => 'sdp' in m.data).map((m) => [m.from, m.to, (m.data.sdp as Description).type])).toEqual([
      [0, 1, 'offer'],
      [1, 0, 'answer'],
    ]);
    // One line of sound, each way, on both sides.
    expect(peersOf(0)[0].localDescription!.sdp).toBe('offer with 1 line');
    expect(peersOf(1)[0].localDescription!.sdp).toBe('answer, sendrecv');
    // Each side learned a way to reach the other, with the servers the game was given.
    expect(peersOf(0)[0].reached).toEqual([{ candidate: 'via answer' }]);
    expect(peersOf(1)[0].reached).toEqual([{ candidate: 'via offer' }]);
    expect(peersOf(0)[0].config.iceServers).toEqual([{ urls: 'stun:example.test' }]);
  });

  it('carries the microphone whether it is allowed before the call or during it', async () => {
    voices[0].setMicrophone(microphone('alex'));
    voices[0].call(1);
    await settle();
    expect(peersOf(0)[0].sending).toBe('alex');
    expect(peersOf(1)[0].sending).toBeNull();

    voices[1].setMicrophone(microphone('sam'));
    await settle();
    expect(peersOf(1)[0].sending).toBe('sam');
    // Refused after all, or unplugged: the call stays up, silent.
    voices[0].setMicrophone(null);
    await settle();
    expect(peersOf(0)[0].sending).toBeNull();
    expect(voices[0].states()).toEqual({ 1: 'connected' });
  });

  it('sends its description before any way to reach it, in both directions', async () => {
    voices[0].call(1);
    await settle();
    const kinds = (from: number): string[] => sent.filter((m) => m.from === from).map((m) => Object.keys(m.data)[0]);
    expect(kinds(0)).toEqual(['sdp', 'ice']);
    expect(kinds(1)).toEqual(['sdp', 'ice']);
  });

  it('keeps a way to reach the other side that comes while their answer is still being taken in', async () => {
    held = [];
    voices[0].call(1);
    await settle();
    // The offer and the caller's address reach the other side...
    for (const deliver of held.splice(0)) deliver();
    await settle();
    // ...whose answer and address come back one straight after the other.
    expect(held).toHaveLength(2);
    for (const deliver of held.splice(0)) deliver();
    held = null;
    await settle();
    expect(peersOf(0)[0].reached).toEqual([{ candidate: 'via answer' }]);
    expect(voices[0].states()).toEqual({ 1: 'connected' });
  });

  it('ends when either leaves, and can be rung again', async () => {
    voices[0].call(1);
    await settle();
    voices[1].remove(0);
    voices[0].remove(1);
    expect(FakePeer.made.every((peer) => peer.closed)).toBe(true);
    expect(voices[0].states()).toEqual({});

    voices[0].call(1);
    await settle();
    expect(voices[0].states()).toEqual({ 1: 'connected' });
    expect(peersOf(0)).toHaveLength(2);
  });

  it('is rung again by the one who rang, if it fails', async () => {
    voices[0].call(1);
    await settle();
    const [first] = peersOf(0);
    peersOf(1)[0].fail();
    await settle();
    // The one who answered waits to be rung.
    expect(peersOf(1)).toHaveLength(1);

    first.fail();
    await settle();
    expect(first.closed).toBe(true);
    expect(peersOf(0)).toHaveLength(2);
    expect(peersOf(1)).toHaveLength(2);
    expect(voices[0].states()).toEqual({ 1: 'connected' });
    expect(voices[1].states()).toEqual({ 0: 'connected' });
  });

  it('forgets a call whose player left before it could start', async () => {
    voices[0].call(1);
    voices[0].remove(1);
    await settle();
    expect(FakePeer.made).toHaveLength(0);
    expect(sent).toEqual([]);
  });
});

describe('voice among three players', () => {
  it('gives each pair its own call', async () => {
    voices[0].call(1);
    voices[0].call(2);
    voices[1].call(2);
    await settle();
    expect(voices[0].states()).toEqual({ 1: 'connected', 2: 'connected' });
    expect(voices[1].states()).toEqual({ 0: 'connected', 2: 'connected' });
    expect(voices[2].states()).toEqual({ 0: 'connected', 1: 'connected' });
    expect(FakePeer.made).toHaveLength(6);
  });
});
