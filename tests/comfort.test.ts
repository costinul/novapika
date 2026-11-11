import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { ReachMeter } from '../src/comfort/ReachMeter';
import { PhysicsWorld } from '../src/engine/physics';
import { movementConfig } from '../src/config/movement';
import { cfg, HEAD_Y, lerp, Sim } from './harness';

// Comfort and fit: darkening at speed, and wings that work for short arms.
// The vignette's maths is imported lazily: its drawing half needs a browser.

describe('speed vignette', () => {
  afterEach(() => {
    cfg.comfortVignette.value = 1;
  });

  it('is clear at glide speed and darkest at top speed', async () => {
    const { vignetteOpacity } = await import('../src/comfort/Vignette');
    expect(vignetteOpacity(0, cfg)).toBe(0);
    expect(vignetteOpacity(cfg.glideSpeed.value, cfg)).toBe(0);
    const mid = vignetteOpacity((cfg.vignetteFromSpeed.value + cfg.maxFlySpeed.value) / 2, cfg);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(cfg.vignetteStrength.value);
    expect(vignetteOpacity(cfg.maxFlySpeed.value, cfg)).toBeCloseTo(cfg.vignetteStrength.value);
    expect(vignetteOpacity(50, cfg)).toBeCloseTo(cfg.vignetteStrength.value);
    // Slight: the middle of the view is never covered, and the edge never goes black.
    expect(cfg.vignetteStrength.value).toBeLessThan(0.8);
  });

  it('can be switched off', async () => {
    const { vignetteOpacity } = await import('../src/comfort/Vignette');
    cfg.comfortVignette.value = 0;
    expect(vignetteOpacity(cfg.maxFlySpeed.value, cfg)).toBe(0);
  });
});

describe('arm reach', () => {
  const DT = 1 / 72;
  const hold = (meter: ReachMeter, left: number, right: number, seconds: number): void => {
    for (let t = 0; t < seconds; t += DT) meter.update(left, right, DT);
  };

  it('starts at the adult scale and learns a child\'s reach from spread arms', () => {
    const meter = new ReachMeter();
    expect(meter.scale).toBe(1);
    hold(meter, 0.2, 0.2, 1); // arms by the sides
    hold(meter, 0.46, 0.47, 1); // spread
    expect(meter.reach).toBeCloseTo(0.46, 2);
    expect(meter.scale).toBeCloseTo(0.46 / ReachMeter.REFERENCE, 2);
    hold(meter, 0.2, 0.2, 5);
    expect(meter.reach).toBeCloseTo(0.46, 2); // it keeps the longest
  });

  it('ignores one arm reaching out, and a brief tracking glitch', () => {
    const meter = new ReachMeter();
    hold(meter, 0.45, 0.45, 1);
    hold(meter, 0.2, 0.75, 2); // one hand reaching for something
    expect(meter.reach).toBeCloseTo(0.45, 2);
    hold(meter, 1.4, 1.4, 0.1); // a glitch shorter than the hold
    hold(meter, 0.45, 0.45, 1);
    expect(meter.reach).toBeCloseTo(0.45, 2);
  });

  it('keeps the scale within sensible limits', () => {
    // Arms hanging loosely are not a reach at all.
    const relaxed = new ReachMeter();
    hold(relaxed, 0.25, 0.25, 1);
    expect(relaxed.scale).toBe(1);
    const tiny = new ReachMeter();
    hold(tiny, 0.385, 0.385, 1);
    expect(tiny.scale).toBe(ReachMeter.MIN_SCALE);
    const giant = new ReachMeter();
    hold(giant, 1.2, 1.2, 1);
    expect(giant.scale).toBe(ReachMeter.MAX_SCALE);
  });
});

describe('a child-sized player', () => {
  let physics: PhysicsWorld;
  beforeAll(async () => {
    physics = await PhysicsWorld.create();
  });

  const CHILD_ARM = 0.4; // m, hands this far out with arms fully spread
  const CHILD_SCALE = CHILD_ARM / ReachMeter.REFERENCE;

  it('cannot glide fully at the adult scale, but can once scaled to their reach', () => {
    const glideWith = (scale: number): Sim => {
      const sim = new Sim(physics);
      sim.player.reachScale = scale;
      sim.lift(100);
      sim.hands(CHILD_ARM, HEAD_Y - 0.2, 0);
      sim.run(3);
      return sim;
    };
    const unscaled = glideWith(1);
    expect(unscaled.player.wings.glide).toBeLessThan(0.95);
    expect(unscaled.player.velocity.y).toBeLessThan(-movementConfig.glideSinkRate.value - 0.3);

    const scaled = glideWith(CHILD_SCALE);
    expect(scaled.player.wings.glide).toBe(1);
    expect(scaled.player.movementState).toBe('gliding');
    expect(scaled.player.velocity.y).toBeCloseTo(-movementConfig.glideSinkRate.value, 1);
  });

  it('gets about as much lift from a short, slower flap as an adult from a full one', () => {
    /** Upward speed gained by one downstroke of `stroke` metres in 0.2 s. */
    const lift = (scale: number, arm: number, stroke: number): number => {
      const sim = new Sim(physics);
      sim.player.reachScale = scale;
      sim.lift(100);
      sim.hands(arm, HEAD_Y + stroke / 2, 0);
      sim.run(0.5);
      const before = sim.player.velocity.y;
      const t0 = sim.time;
      sim.run(0.2, (t) => sim.hands(arm, lerp(HEAD_Y + stroke / 2, HEAD_Y - stroke / 2, (t - t0) / 0.2), 0));
      return sim.player.velocity.y - before;
    };
    const adult = lift(1, 0.6, 0.6);
    const child = lift(CHILD_SCALE, CHILD_ARM, 0.6 * CHILD_SCALE);
    expect(adult).toBeGreaterThan(3);
    expect(child).toBeGreaterThan(adult * 0.7);
    expect(child).toBeLessThan(adult * 1.3);
  });
});
