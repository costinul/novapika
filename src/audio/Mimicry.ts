import { VoiceCapture } from './VoiceCapture';

// A tiny audio worklet that passes microphone samples to the page, and only
// while a parrot is listening. It is loaded from a string so the game stays
// a set of plain static files.
const WORKLET = `
class Listen extends AudioWorkletProcessor {
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
registerProcessor('listen', Listen);
`;

/** How much faster, and so higher, a parrot says a phrase back. */
const SQUEAK = 1.6;

/**
 * Lets a lobby parrot repeat what the player says in a squeaky voice.
 *
 * Privacy: the microphone is used for this and nothing else. Sound is only
 * examined while a parrot is listening; one phrase of at most a few seconds
 * is held in memory, played back once, and then dropped. Nothing is stored
 * and nothing is sent anywhere. If permission is refused, the game simply
 * has no mimicry.
 */
export class Mimicry {
  /** A phrase that has been heard and not yet repeated. */
  phrase: Float32Array | null = null;
  private ctx: AudioContext | null = null;
  private node: AudioWorkletNode | null = null;
  private capture: VoiceCapture | null = null;
  private asked = false;

  get available(): boolean {
    return this.node !== null;
  }

  /**
   * Ask for the microphone. Asks at most once per visit; call it from a
   * click or button press. Resolves false if it is refused or unsupported.
   */
  async enable(ctx: AudioContext): Promise<boolean> {
    if (this.asked) return this.available;
    this.asked = true;
    try {
      if (!ctx.audioWorklet || !navigator.mediaDevices?.getUserMedia) return false;
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      const url = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }));
      await ctx.audioWorklet.addModule(url);
      URL.revokeObjectURL(url);

      const node = new AudioWorkletNode(ctx, 'listen', { numberOfInputs: 1, numberOfOutputs: 0 });
      // The microphone feeds only the listener. It is never played out loud.
      ctx.createMediaStreamSource(stream).connect(node);
      const capture = new VoiceCapture(ctx.sampleRate);
      node.port.onmessage = (e: MessageEvent<Float32Array>) => {
        const phrase = capture.feed(e.data);
        if (phrase) {
          this.phrase = phrase;
          this.stopListening();
        }
      };
      this.ctx = ctx;
      this.node = node;
      this.capture = capture;
      return true;
    } catch {
      return false; // Refused, or no microphone: the game carries on without.
    }
  }

  /** Start waiting for the player to say something. */
  listen(): void {
    this.phrase = null;
    this.capture?.reset();
    this.node?.port.postMessage('on');
  }

  stopListening(): void {
    this.node?.port.postMessage('off');
    this.capture?.reset();
  }

  /**
   * Say the phrase back, faster and higher, then forget it. `loudness` is
   * 0..1. Returns how long it lasts in seconds, or 0 if there was nothing.
   */
  repeat(loudness: number): number {
    const ctx = this.ctx;
    const phrase = this.phrase;
    this.phrase = null;
    if (!ctx || !phrase || ctx.state !== 'running') return 0;
    const buffer = ctx.createBuffer(1, phrase.length, ctx.sampleRate);
    buffer.getChannelData(0).set(phrase);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = SQUEAK;
    // A little thinner, like a small bird.
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 500;
    const gain = ctx.createGain();
    gain.gain.value = 1.4 * loudness;
    source.connect(filter).connect(gain).connect(ctx.destination);
    source.start();
    return buffer.duration / SQUEAK;
  }
}
