/**
 * Picks one short phrase out of a stream of microphone samples: it waits for
 * sound, records until the speaker pauses or a few seconds have passed, and
 * hands the phrase back. Everything stays in memory; nothing is kept once
 * the phrase has been returned.
 */
export class VoiceCapture {
  /** Loudness (RMS) above which a block counts as someone speaking. */
  static readonly SPEECH_LEVEL = 0.02;
  static readonly MAX_SECONDS = 3;
  /** A pause this long ends the phrase. */
  static readonly PAUSE_SECONDS = 0.45;
  /** Anything shorter than this is a click or a bump, not a word. */
  static readonly MIN_SECONDS = 0.3;
  /** Sound kept from just before speech began, so the first word is whole. */
  static readonly LEAD_IN_SECONDS = 0.12;

  private leadIn: Float32Array[] = [];
  private leadInLength = 0;
  private blocks: Float32Array[] = [];
  private length = 0;
  private spoken = 0;
  private quiet = 0;
  private recording = false;

  constructor(private readonly sampleRate: number) {}

  /** Forget anything heard so far. */
  reset(): void {
    this.leadIn = [];
    this.leadInLength = 0;
    this.blocks = [];
    this.length = 0;
    this.spoken = 0;
    this.quiet = 0;
    this.recording = false;
  }

  /** Give the next block of samples. Returns a phrase when one has just ended. */
  feed(block: Float32Array): Float32Array | null {
    let sum = 0;
    for (let i = 0; i < block.length; i++) sum += block[i] * block[i];
    const loud = Math.sqrt(sum / Math.max(1, block.length)) > VoiceCapture.SPEECH_LEVEL;
    const seconds = block.length / this.sampleRate;

    if (!this.recording) {
      if (!loud) {
        // Keep only the last moment of quiet.
        this.leadIn.push(block.slice());
        this.leadInLength += block.length;
        while (this.leadInLength - this.leadIn[0].length > VoiceCapture.LEAD_IN_SECONDS * this.sampleRate) {
          this.leadInLength -= this.leadIn.shift()!.length;
        }
        return null;
      }
      this.recording = true;
      this.blocks = this.leadIn;
      this.length = this.leadInLength;
      this.leadIn = [];
      this.leadInLength = 0;
    }

    this.blocks.push(block.slice());
    this.length += block.length;
    if (loud) {
      this.spoken += seconds;
      this.quiet = 0;
    } else {
      this.quiet += seconds;
    }

    const paused = this.quiet >= VoiceCapture.PAUSE_SECONDS;
    const full = this.length >= VoiceCapture.MAX_SECONDS * this.sampleRate;
    if (!paused && !full) return null;

    const worthKeeping = this.spoken >= VoiceCapture.MIN_SECONDS;
    // Drop most of the pause at the end.
    const keep = Math.max(0, this.length - Math.max(0, this.quiet - 0.1) * this.sampleRate);
    const phrase = worthKeeping ? this.join(Math.floor(keep)) : null;
    this.reset();
    return phrase;
  }

  private join(length: number): Float32Array {
    const out = new Float32Array(length);
    let offset = 0;
    for (const block of this.blocks) {
      if (offset >= length) break;
      const part = block.subarray(0, Math.min(block.length, length - offset));
      out.set(part, offset);
      offset += part.length;
    }
    return out;
  }
}
