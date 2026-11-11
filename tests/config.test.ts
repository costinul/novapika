import { describe, expect, it } from 'vitest';
import { movementConfig, nudge } from '../src/config/movement';
import type { Tunable } from '../src/config/movement';

describe('movement config', () => {
  it('gives every constant a unit, a comment and a start value inside its range', () => {
    for (const [key, t] of Object.entries<Tunable>(movementConfig)) {
      expect(t.unit, key).not.toBe('');
      expect(t.comment, key).not.toBe('');
      expect(t.step, key).toBeGreaterThan(0);
      expect(t.value, key).toBeGreaterThanOrEqual(t.min);
      expect(t.value, key).toBeLessThanOrEqual(t.max);
    }
  });

  it("starts at the requirements, as tuned from the owner's first headset test", () => {
    // Flapping was too hard: lower threshold, wider window, stronger and
    // cheaper flaps, and a gentler glide than the requirements' first values.
    expect(movementConfig.flapSpeedThreshold.value).toBe(1.0); // was 1.5
    expect(movementConfig.flapSyncWindow.value).toBe(220); // was 150
    expect(movementConfig.flapPower.value).toBe(17); // was 13
    expect(movementConfig.glideSinkRate.value).toBe(0.8); // was 1
    expect(movementConfig.flapsPerFullStamina.value).toBe(20); // was 12
    // Unchanged.
    expect(movementConfig.maxFlySpeed.value).toBe(8);
    expect(movementConfig.catchAbsorbTime.value).toBe(0.2);
    expect(movementConfig.staminaRefillTime.value).toBe(3);
  });
});

describe('nudge', () => {
  const make = (): Tunable => ({ value: 0.2, unit: 's', min: 0.1, max: 0.3, step: 0.05, comment: 'x' });

  it('moves by one step without float drift', () => {
    const t = make();
    nudge(t, 1);
    expect(t.value).toBe(0.25);
    nudge(t, -1);
    nudge(t, -1);
    expect(t.value).toBe(0.15);
  });

  it('clamps to the range', () => {
    const t = make();
    for (let i = 0; i < 10; i++) nudge(t, 1);
    expect(t.value).toBe(0.3);
    for (let i = 0; i < 10; i++) nudge(t, -1);
    expect(t.value).toBe(0.1);
  });
});
