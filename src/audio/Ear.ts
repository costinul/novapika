import { HEARD_RATE, MAX_HEARD_SECONDS } from '../../shared/helper';
import { VoiceCapture } from './VoiceCapture';

// A tiny audio worklet that passes microphone samples to the page, and only
// while the helper parrot is listening. Loaded from a string so the game
// stays a set of plain static files.
const WORKLET = `
class HelperEar extends AudioWorkletProcessor {
  constructor() {
    super();
    this.on = false;
    this.port.onmessage = (e) => { this.on = e.data === 'on'; };
  }
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (this.on && channel) this.port.postMessage(channel.slice());
    return true;
  }
}
registerProcessor('helper-ear', HelperEar);
`;

/** A child stops to think in the middle of a question: a pause this long ends the phrase. */
const PAUSE_SECONDS = 0.8;

/**
 * A phrase as the helper parrot is sent it: 16-bit samples at `HEARD_RATE`.
 * Each new sample is the mean of the ones it stands for.
 */
export function toHeard(phrase: Float32Array, rate: number): Int16Array {
  const step = rate / HEARD_RATE;
  const out = new Int16Array(Math.floor(phrase.length / step));
  for (let i = 0; i < out.length; i++) {
    const from = Math.floor(i * step);
    const to = Math.max(from + 1, Math.floor((i + 1) * step));
    let sum = 0;
    for (let k = from; k < to; k++) sum += phrase[k];
    out[i] = Math.max(-32768, Math.min(32767, Math.round((sum / (to - from)) * 32767)));
  }
  return out;
}

/**
 * Hears what the player says to the helper parrot, one phrase at a time.
 *
 * Privacy: sound is only examined while `listen(true)` is in force, which the
 * game sets only while the player is close to the helper parrot and facing
 * it. A phrase of at most a few seconds is handed to `onPhrase`, which sends
 * it to the game's server to be turned into text; nothing is kept here.
 * (The same microphone feeds mimicry and the voice between players.)
 */
export class Ear {
  /** Given each phrase heard while listening. */
  onPhrase: ((samples: Int16Array) => void) | null = null;
  private node: AudioWorkletNode | null = null;
  private capture: VoiceCapture | null = null;
  private asked = false;
  private on = false;

  get available(): boolean {
    return this.node !== null;
  }

  /** Get ready to listen to the microphone, once. Resolves false if there is none or it cannot be done. */
  async enable(ctx: AudioContext, stream: MediaStream | null): Promise<boolean> {
    if (this.asked) return this.available;
    this.asked = true;
    try {
      if (!ctx.audioWorklet || !stream) return false;
      const url = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }));
      await ctx.audioWorklet.addModule(url);
      URL.revokeObjectURL(url);

      const node = new AudioWorkletNode(ctx, 'helper-ear', { numberOfInputs: 1, numberOfOutputs: 0 });
      // The microphone feeds only the listener. It is never played out loud.
      ctx.createMediaStreamSource(stream).connect(node);
      const capture = new VoiceCapture(ctx.sampleRate, { maxSeconds: MAX_HEARD_SECONDS, pauseSeconds: PAUSE_SECONDS });
      node.port.onmessage = (e: MessageEvent<Float32Array>) => {
        const phrase = this.on ? capture.feed(e.data) : null;
        if (phrase) this.onPhrase?.(toHeard(phrase, ctx.sampleRate));
      };
      this.node = node;
      this.capture = capture;
      return true;
    } catch {
      return false; // The game carries on without.
    }
  }

  /** Start or stop listening. Anything half heard is dropped. */
  listen(on: boolean): void {
    if (on === this.on) return;
    this.on = on;
    this.capture?.reset();
    this.node?.port.postMessage(on ? 'on' : 'off');
  }
}
