import { beforeEach, describe, expect, it } from 'vitest';
import { createRecognisers } from '../src/stunts/recognisers';
import type { StuntRecogniser, StuntSample } from '../src/stunts/recognisers';

// Stunt recognisers, fed made-up movement one frame at a time.

const DT = 1 / 72;
let recognisers: StuntRecogniser[];
let seen: string[];

const base: StuntSample = {
  state: 'gliding',
  speed: 5,
  verticalSpeed: -1,
  rolling: 0,
  clearance: 10,
  height: 10,
  passedRing: false,
};

beforeEach(() => {
  recognisers = createRecognisers();
  seen = [];
});

/** Hold a kind of movement for a while. */
function hold(seconds: number, sample: Partial<StuntSample> = {}): void {
  const s = { ...base, ...sample };
  for (let t = 0; t < seconds; t += DT) {
    for (const r of recognisers) if (r.update(s, DT)) seen.push(r.name);
  }
}

const count = (name: string): number => seen.filter((n) => n === name).length;

describe('stunt recognisers', () => {
  it('sees nothing in an ordinary glide', () => {
    hold(5);
    expect(seen).toEqual([]);
  });

  it('one-wing roll: once per spiral, after it has been held a moment', () => {
    hold(0.4, { state: 'rolling', rolling: 1 });
    expect(count('oneWingRoll')).toBe(0);
    hold(1.5, { state: 'rolling', rolling: 1 });
    expect(count('oneWingRoll')).toBe(1);
    hold(0.5);
    hold(1, { state: 'rolling', rolling: -1 });
    expect(count('oneWingRoll')).toBe(2);
  });

  it('barrel roll: one way, then quickly the other', () => {
    hold(0.4, { state: 'rolling', rolling: 1 });
    hold(0.2); // swapping arms
    hold(0.4, { state: 'rolling', rolling: -1 });
    expect(count('barrelRoll')).toBe(1);
  });

  it('barrel roll: not if the swap is slow, or the roll is the same way twice', () => {
    hold(0.4, { state: 'rolling', rolling: 1 });
    hold(1.5);
    hold(0.4, { state: 'rolling', rolling: -1 });
    hold(0.2);
    hold(0.4, { state: 'rolling', rolling: -1 });
    expect(count('barrelRoll')).toBe(0);
  });

  it('dive bomb: a long fast dive, then a pull-out', () => {
    hold(1, { state: 'diving', speed: 8, verticalSpeed: -8 });
    expect(count('diveBomb')).toBe(0);
    hold(0.3, { state: 'gliding', speed: 7, verticalSpeed: -1 });
    expect(count('diveBomb')).toBe(1);
  });

  it('dive bomb: not for a short dip, and not for a dive that ends on the ground', () => {
    hold(0.2, { state: 'diving', speed: 6, verticalSpeed: -6 });
    hold(0.5);
    hold(1, { state: 'diving', speed: 8, verticalSpeed: -8 });
    hold(1, { state: 'standing', speed: 0, verticalSpeed: 0, clearance: 0, height: 0 });
    hold(1);
    expect(count('diveBomb')).toBe(0);
  });

  it('swoop: fast and low for a moment', () => {
    hold(1, { speed: 7.5, clearance: 6 });
    expect(count('swoop')).toBe(0);
    hold(1, { speed: 7.5, clearance: 1 });
    expect(count('swoop')).toBe(1);
  });

  it('ring pass: each ring flown', () => {
    hold(DT, { passedRing: true });
    hold(1);
    hold(DT, { passedRing: true });
    expect(count('ringPass')).toBe(2);
  });

  it('perch landing: arriving at speed on something off the ground', () => {
    hold(1, { speed: 5 });
    hold(0.2, { state: 'climbing', speed: 0.5, verticalSpeed: 0, clearance: 0.3, height: 6 });
    expect(count('perchLanding')).toBe(1);
  });

  it('perch landing: not on the ground, and not after drifting in slowly', () => {
    hold(1, { speed: 5 });
    hold(0.2, { state: 'standing', speed: 0, verticalSpeed: 0, clearance: 0, height: 0 });
    hold(1, { speed: 1.5 });
    hold(0.2, { state: 'standing', speed: 0, verticalSpeed: 0, clearance: 0, height: 6 });
    expect(count('perchLanding')).toBe(0);
  });
});
