import { describe, expect, it } from 'vitest';
import { FixedStepper } from '../src/engine/fixedStep';

describe('FixedStepper', () => {
  it('runs one step per frame when the frame matches the step', () => {
    const s = new FixedStepper(1 / 100);
    expect(s.advance(1 / 100)).toBe(1);
    expect(s.advance(1 / 100)).toBe(1);
  });

  it('carries leftover time into the next frame', () => {
    const s = new FixedStepper(0.01);
    expect(s.advance(0.015)).toBe(1);
    expect(s.alpha).toBeCloseTo(0.5);
    expect(s.advance(0.015)).toBe(2);
    expect(s.alpha).toBeCloseTo(0);
  });

  it('gives the same number of steps per second at any frame rate', () => {
    for (const fps of [72, 90, 120]) {
      const s = new FixedStepper(1 / 120);
      let steps = 0;
      for (let i = 0; i < fps; i++) steps += s.advance(1 / fps);
      expect(steps).toBe(120);
    }
  });

  it('caps steps after a long hitch and drops the backlog', () => {
    const s = new FixedStepper(0.01, 5);
    expect(s.advance(1)).toBe(5);
    expect(s.advance(0.01)).toBe(1);
  });

  it('ignores negative frame times', () => {
    const s = new FixedStepper(0.01);
    expect(s.advance(-1)).toBe(0);
  });
});
