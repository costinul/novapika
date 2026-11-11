import { describe, expect, it } from 'vitest';
import { VoiceCapture } from '../src/audio/VoiceCapture';

// Picking one phrase out of a microphone stream, with made-up sound.

const RATE = 48000;
const BLOCK = 128; // what an audio worklet delivers

/** Feed seconds of a tone (or silence when level is 0); returns any phrases that came out. */
function feed(capture: VoiceCapture, seconds: number, level: number): Float32Array[] {
  const phrases: Float32Array[] = [];
  const blocks = Math.round((seconds * RATE) / BLOCK);
  for (let b = 0; b < blocks; b++) {
    const block = new Float32Array(BLOCK);
    for (let i = 0; i < BLOCK; i++) block[i] = level * Math.sin((2 * Math.PI * 300 * (b * BLOCK + i)) / RATE);
    const phrase = capture.feed(block);
    if (phrase) phrases.push(phrase);
  }
  return phrases;
}

const seconds = (phrase: Float32Array): number => phrase.length / RATE;

describe('VoiceCapture', () => {
  it('hears nothing in silence', () => {
    const capture = new VoiceCapture(RATE);
    expect(feed(capture, 5, 0)).toHaveLength(0);
    expect(feed(capture, 5, 0.005)).toHaveLength(0); // room noise
  });

  it('returns a phrase once the speaker pauses, with little silence round it', () => {
    const capture = new VoiceCapture(RATE);
    feed(capture, 1, 0);
    expect(feed(capture, 1.2, 0.2)).toHaveLength(0); // still talking
    const phrases = feed(capture, 1, 0);
    expect(phrases).toHaveLength(1);
    expect(seconds(phrases[0])).toBeGreaterThan(1.2);
    expect(seconds(phrases[0])).toBeLessThan(1.2 + 0.3);
    // The first word is whole: the phrase starts quiet, then gets loud.
    expect(Math.abs(phrases[0][0])).toBeLessThan(0.01);
    expect(Math.max(...phrases[0].subarray(0, RATE * 0.3))).toBeGreaterThan(0.15);
  });

  it('ignores a click or a bump', () => {
    const capture = new VoiceCapture(RATE);
    feed(capture, 0.5, 0);
    feed(capture, 0.1, 0.5);
    expect(feed(capture, 1, 0)).toHaveLength(0);
  });

  it('keeps at most a few seconds, however long the speaker goes on', () => {
    const capture = new VoiceCapture(RATE);
    const phrases = feed(capture, 8, 0.2);
    expect(phrases.length).toBeGreaterThanOrEqual(2);
    for (const phrase of phrases) expect(seconds(phrase)).toBeLessThanOrEqual(VoiceCapture.MAX_SECONDS + 0.01);
  });

  it('carries on through a short gap between words', () => {
    const capture = new VoiceCapture(RATE);
    feed(capture, 0.4, 0.2);
    expect(feed(capture, 0.2, 0)).toHaveLength(0);
    feed(capture, 0.4, 0.2);
    const phrases = feed(capture, 1, 0);
    expect(phrases).toHaveLength(1);
    expect(seconds(phrases[0])).toBeGreaterThan(0.95);
  });

  it('forgets everything on reset and holds nothing after a phrase', () => {
    const capture = new VoiceCapture(RATE);
    feed(capture, 1, 0.2);
    capture.reset();
    expect(feed(capture, 1, 0)).toHaveLength(0);

    feed(capture, 1, 0.2);
    expect(feed(capture, 1, 0)).toHaveLength(1);
    expect(feed(capture, 3, 0)).toHaveLength(0);
  });
});
