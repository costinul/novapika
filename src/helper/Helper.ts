import { Vector3 } from 'three';
import { SOUND_HEAD } from '../../shared/helper';
import type { HelperIntent } from '../../shared/helper';
import type { Ear } from '../audio/Ear';
import type { Player } from '../player/Player';

// The game's side of the lobby's helper parrot: when it hears the local
// player, and how its voice is played. Its mind is on the lobby server; its
// body is one of the lobby's own parrots, run like the rest of the flock.

/** The player must be this close to the helper parrot to be heard. */
const HEAR_WITHIN = 3.5; // m
/** And looking this nearly straight at it: the cosine of about 40 degrees. */
const FACING = 0.77;
/** How long to wait for an answer to a phrase before listening again. */
const ANSWER_WITHIN = 12; // s
/** A moment of quiet after the helper speaks, so it never hears itself. */
const AFTER_SPEAKING = 0.4; // s
/** Its voice is at full loudness within this distance, and fades beyond it, as the players' voices do. */
const FULL_WITHIN = 1.5; // m
const FADE = 1;

export interface HelperDeps {
  /** The player this game is played by. */
  local: Player;
  /** The lobby's helper parrot, or null if this lobby has none. */
  parrot(): Player | null;
  ear: Pick<Ear, 'available' | 'listen' | 'onPhrase'>;
  /** The game's audio, once the player has pressed something; null before. */
  context(): AudioContext | null;
  /** Send a phrase to the lobby server. */
  send(samples: Int16Array): void;
  /** The helper parrot's voice has started, and lasts this long. */
  onSpeaks(seconds: number): void;
  /** It could not answer. */
  onSquawks(): void;
  /** What its body does from now: stay on its stump, keep near a player, or go to a place. */
  onIntent(intent: HelperIntent): void;
}

export class Helper {
  /** The server says the helper is listening: switched on, and with phrases left today. */
  private listens = false;
  /** Seconds left to wait for the answer to a phrase that was sent. */
  private waiting = 0;
  /** Seconds left of the helper speaking. */
  private speaking = 0;
  private panner: PannerNode | null = null;
  private source: AudioBufferSourceNode | null = null;
  private readonly to = new Vector3();
  private readonly forward = new Vector3();

  constructor(private readonly deps: HelperDeps) {
    deps.ear.onPhrase = (samples) => {
      // Heard as the player turned away, or while an answer is on its way: let it go.
      if (!this.attending()) return;
      this.waiting = ANSWER_WITHIN;
      deps.ear.listen(false);
      deps.send(samples);
    };
  }

  /** The lobby has said whether the helper parrot is listening. No answer is on its way. */
  setListens(listens: boolean): void {
    this.listens = listens;
    this.waiting = 0;
  }

  /** The lobby has said what the helper parrot's body does from now. */
  setIntent(intent: HelperIntent): void {
    this.deps.onIntent(intent);
  }

  /** The line to the lobby is down, or the lobby was left. */
  clear(): void {
    this.deps.onIntent({ do: 'stay' });
    this.listens = false;
    this.waiting = 0;
    this.speaking = 0;
    this.source?.stop();
    this.source = null;
    this.deps.ear.listen(false);
  }

  /** The helper parrot's voice has come: a frame from the lobby, sound after its first bytes. */
  speech(frame: ArrayBuffer): void {
    this.waiting = 0;
    const ctx = this.deps.context();
    if (!ctx || ctx.state !== 'running' || !this.deps.parrot()) return;
    void ctx.decodeAudioData(frame.slice(SOUND_HEAD)).then(
      (buffer) => {
        this.source?.stop();
        if (!this.panner) {
          this.panner = new PannerNode(ctx, {
            panningModel: 'HRTF',
            distanceModel: 'inverse',
            refDistance: FULL_WITHIN,
            rolloffFactor: FADE,
          });
          this.panner.connect(ctx.destination);
        }
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(this.panner);
        source.start();
        this.source = source;
        this.speaking = buffer.duration + AFTER_SPEAKING;
        this.deps.onSpeaks(buffer.duration);
      },
      // Sound that cannot be played is the same as no answer.
      () => this.deps.onSquawks(),
    );
  }

  /** The helper parrot heard a phrase and could not answer it. */
  squawk(): void {
    this.waiting = 0;
    this.deps.onSquawks();
  }

  /** Once per drawn frame. */
  frame(dt: number): void {
    this.waiting = Math.max(0, this.waiting - dt);
    this.speaking = Math.max(0, this.speaking - dt);
    this.deps.ear.listen(this.attending());

    // Its voice comes from where its head is.
    const head = this.deps.parrot()?.head.position;
    if (this.panner && head) {
      this.panner.positionX.value = head.x;
      this.panner.positionY.value = head.y;
      this.panner.positionZ.value = head.z;
    }
  }

  /**
   * Whether the local player is speaking to the helper parrot: it is
   * listening, nothing is on its way, and they are close and facing it.
   * Nothing a player says anywhere else is ever sent.
   */
  private attending(): boolean {
    const { local, ear } = this.deps;
    if (!this.listens || !ear.available || this.waiting > 0 || this.speaking > 0) return false;
    const parrot = this.deps.parrot();
    if (!parrot) return false;
    const to = this.to.copy(parrot.head.position).sub(local.head.position);
    const distance = to.length();
    if (distance > HEAR_WITHIN) return false;
    if (distance < 0.01) return true;
    const forward = this.forward.set(0, 0, -1).applyQuaternion(local.head.quaternion);
    return forward.dot(to) / distance > FACING;
  }
}
