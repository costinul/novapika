import type { Quaternion, Vector3 } from 'three';
import type { RtcData } from '../../shared/net';

// Talking to the other players. Each pair of players holds one WebRTC
// connection straight between their two games; the lobby server only passes
// the few messages it takes to set one up, and never hears a voice. Each
// voice is played from where its parrot is: louder when closer, and from the
// right direction.

/** Voices are at full loudness within this distance, and fade beyond it. */
const FULL_WITHIN = 1.5; // m
/** How quickly a voice fades with distance. 1 halves it at twice `FULL_WITHIN`. */
const FADE = 1;

export interface VoiceDeps {
  /** The game's audio, once the player has pressed something; null before. */
  context(): AudioContext | null;
  /** Pass a set-up message to the player in place `to`, through the lobby. */
  send(to: number, data: RtcData): void;
  /** The servers two games use to find a way to each other. */
  iceServers(): Promise<RTCIceServer[]>;
  /** Makes a connection. Left out, the browser's own. */
  newPeer?(config: RTCConfiguration): RTCPeerConnection;
}

interface Peer {
  /** Null until the list of servers has come. */
  pc: RTCPeerConnection | null;
  /** True for the side that rang: it rings again if the call fails. */
  caller: boolean;
  /** The other side's description is in: ways to reach them can now be added. */
  ready: boolean;
  /** Ways to reach them that came too early. */
  waiting: RTCIceCandidateInit[];
  stream: MediaStream | null;
  /** Chrome only lets a voice into the game's audio if an element is playing it too. */
  element: HTMLAudioElement | null;
  source: MediaStreamAudioSourceNode | null;
  panner: PannerNode | null;
}

export class Voice {
  private readonly peers = new Map<number, Peer>();
  private track: MediaStreamTrack | null = null;
  private servers: Promise<RTCIceServer[]> | null = null;

  constructor(private readonly deps: VoiceDeps) {}

  /** The microphone has been allowed (or `null`: there is none). Everyone connected starts to hear it. */
  setMicrophone(stream: MediaStream | null): void {
    this.track = stream?.getAudioTracks()[0] ?? null;
    for (const peer of this.peers.values()) {
      void peer.pc?.getTransceivers()[0]?.sender.replaceTrack(this.track);
    }
  }

  /** Ring the player in place `slot`. Of any two players, the one in the lower place rings. */
  call(slot: number): void {
    void this.connect(slot, null).catch(console.error);
  }

  /** A set-up message from the player in place `from`. */
  signal(from: number, data: RtcData): void {
    void this.take(from, data as { sdp?: RTCSessionDescriptionInit; ice?: RTCIceCandidateInit }).catch(console.error);
  }

  /** The player in place `slot` has left. */
  remove(slot: number): void {
    const peer = this.peers.get(slot);
    if (!peer) return;
    this.peers.delete(slot);
    peer.source?.disconnect();
    peer.panner?.disconnect();
    if (peer.element) peer.element.srcObject = null;
    peer.pc?.close();
  }

  clear(): void {
    for (const slot of [...this.peers.keys()]) this.remove(slot);
  }

  /**
   * Once per drawn frame: where the local player's head is, and where each
   * other player's head is (`headOf` gives null for one not seen yet).
   */
  place(position: Vector3, turn: Quaternion, headOf: (slot: number) => Vector3 | null, scratch: Vector3): void {
    const ctx = this.deps.context();
    if (!ctx || this.peers.size === 0) return;
    const listener = ctx.listener;
    const forward = scratch.set(0, 0, -1).applyQuaternion(turn);
    const [fx, fy, fz] = [forward.x, forward.y, forward.z];
    const up = scratch.set(0, 1, 0).applyQuaternion(turn);
    if (listener.positionX) {
      listener.positionX.value = position.x;
      listener.positionY.value = position.y;
      listener.positionZ.value = position.z;
      listener.forwardX.value = fx;
      listener.forwardY.value = fy;
      listener.forwardZ.value = fz;
      listener.upX.value = up.x;
      listener.upY.value = up.y;
      listener.upZ.value = up.z;
    } else {
      // Older browsers.
      listener.setPosition(position.x, position.y, position.z);
      listener.setOrientation(fx, fy, fz, up.x, up.y, up.z);
    }

    for (const [slot, peer] of this.peers) {
      if (peer.stream && !peer.panner) this.play(peer, ctx);
      const head = peer.panner && headOf(slot);
      if (!head || !peer.panner) continue;
      peer.panner.positionX.value = head.x;
      peer.panner.positionY.value = head.y;
      peer.panner.positionZ.value = head.z;
    }
  }

  /** How each call is doing, by place. For the debug panel and tests. */
  states(): Record<number, string> {
    const states: Record<number, string> = {};
    for (const [slot, peer] of this.peers) states[slot] = peer.pc?.connectionState ?? 'starting';
    return states;
  }

  /** Start a connection to `slot`: ringing them, or answering the `offer` they sent. */
  private async connect(slot: number, offer: RTCSessionDescriptionInit | null): Promise<void> {
    this.remove(slot);
    const peer: Peer = {
      pc: null,
      caller: offer === null,
      ready: false,
      waiting: [],
      stream: null,
      element: null,
      source: null,
      panner: null,
    };
    this.peers.set(slot, peer);
    const iceServers = await (this.servers ??= this.deps.iceServers());
    // They left, or rang again, while the list of servers was on its way.
    if (this.peers.get(slot) !== peer) return;

    const pc = this.deps.newPeer?.({ iceServers }) ?? new RTCPeerConnection({ iceServers });
    peer.pc = pc;
    // Ways to reach this side are held until its description has gone, so the
    // other side always has the call before it has anything to add to it.
    let unsent: RtcData[] | null = [];
    pc.onicecandidate = (event) => {
      if (!event.candidate) return;
      const data = { ice: event.candidate.toJSON() };
      if (unsent) unsent.push(data);
      else this.deps.send(slot, data);
    };
    pc.ontrack = (event) => {
      peer.stream = event.streams[0] ?? new MediaStream([event.track]);
    };
    pc.onconnectionstatechange = () => {
      // The call dropped for good: whoever rang, rings again.
      if (pc.connectionState === 'failed' && peer.caller && this.peers.get(slot) === peer) this.call(slot);
    };

    if (offer) {
      await pc.setRemoteDescription(offer);
      if (this.peers.get(slot) !== peer) return;
      const audio = pc.getTransceivers()[0];
      if (audio) {
        audio.direction = 'sendrecv';
        await audio.sender.replaceTrack(this.track);
      }
      await this.flush(peer);
      await pc.setLocalDescription(await pc.createAnswer());
    } else {
      // One line of sound each way, whether or not there is a microphone yet.
      const audio = pc.addTransceiver('audio', { direction: 'sendrecv' });
      await audio.sender.replaceTrack(this.track);
      await pc.setLocalDescription(await pc.createOffer());
    }
    if (this.peers.get(slot) !== peer || !pc.localDescription) return;
    this.deps.send(slot, { sdp: { type: pc.localDescription.type, sdp: pc.localDescription.sdp } });
    for (const data of unsent) this.deps.send(slot, data);
    unsent = null;
  }

  private async take(from: number, data: { sdp?: RTCSessionDescriptionInit; ice?: RTCIceCandidateInit }): Promise<void> {
    if (data.sdp?.type === 'offer') return this.connect(from, data.sdp);
    const peer = this.peers.get(from);
    if (!peer) return;
    if (data.sdp?.type === 'answer' && peer.pc && peer.caller && !peer.ready) {
      await peer.pc.setRemoteDescription(data.sdp);
      await this.flush(peer);
    } else if (data.ice) {
      if (peer.ready && peer.pc) await peer.pc.addIceCandidate(data.ice);
      else peer.waiting.push(data.ice);
    }
  }

  /** The other side's description is in: add the ways to reach them that came early. */
  private async flush(peer: Peer): Promise<void> {
    peer.ready = true;
    for (const candidate of peer.waiting.splice(0)) await peer.pc?.addIceCandidate(candidate);
  }

  /** Play a voice from where its parrot is. */
  private play(peer: Peer, ctx: AudioContext): void {
    const stream = peer.stream!;
    const element = new Audio();
    element.muted = true;
    element.srcObject = stream;
    peer.element = element;
    peer.source = ctx.createMediaStreamSource(stream);
    peer.panner = new PannerNode(ctx, {
      panningModel: 'HRTF',
      distanceModel: 'inverse',
      refDistance: FULL_WITHIN,
      rolloffFactor: FADE,
    });
    peer.source.connect(peer.panner).connect(ctx.destination);
  }
}
