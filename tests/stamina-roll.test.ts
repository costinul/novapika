import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { PhysicsWorld } from '../src/engine/physics';
import { cfg, HEAD_Y, lerp, Sim } from './harness';

// Stamina and the one-wing roll, driven by synthetic hand traces.

const ARM = 0.6;
const SHOULDER = HEAD_Y - 0.2;

let physics: PhysicsWorld;
beforeAll(async () => {
  physics = await PhysicsWorld.create();
});
afterEach(() => {
  cfg.staminaEnabled.value = 1;
});

const spread = (sim: Sim): void => sim.hands(ARM, SHOULDER, 0);

/** A 0.6 m downstroke in 0.2 s, then a slower 0.4 s upstroke. */
function flapHeight(phase: number): number {
  const p = ((phase % 0.6) + 0.6) % 0.6;
  return p < 0.2 ? lerp(HEAD_Y + 0.3, HEAD_Y - 0.3, p / 0.2) : lerp(HEAD_Y - 0.3, HEAD_Y + 0.3, (p - 0.2) / 0.4);
}

/** Flap `count` times in open air; returns the upward speed each downstroke gave. */
function flap(sim: Sim, count: number): number[] {
  const gains: number[] = [];
  const t0 = sim.time;
  for (let i = 0; i < count; i++) {
    const before = sim.player.velocity.y;
    sim.run(0.2, (t) => sim.hands(ARM, flapHeight(t - t0), 0)); // downstroke
    gains.push(sim.player.velocity.y - before);
    sim.run(0.4, (t) => sim.hands(ARM, flapHeight(t - t0), 0)); // upstroke
  }
  return gains;
}

describe('stamina', () => {
  it('pays for the configured number of full flaps, then flaps go weak', () => {
    const sim = new Sim(physics);
    sim.lift(500);
    sim.hands(ARM, HEAD_Y + 0.3, 0);
    const full = cfg.flapsPerFullStamina.value;

    const strong = flap(sim, full);
    expect(sim.player.stamina).toBeCloseTo(0, 5);
    const weak = flap(sim, 3);

    const typical = strong[Math.floor(full / 2)];
    for (const gain of strong) expect(gain).toBeGreaterThan(typical * 0.8);
    // With nothing left a flap gives only a share of the lift: enough to
    // soften a fall, not to climb.
    for (const gain of weak) expect(gain).toBeLessThan(typical * 0.5);
    expect(sim.player.wings.flapStrength).toBe(cfg.staminaEmptyLift.value);
    expect(sim.player.stamina).toBe(0);
  });

  it('is not spent by gliding', () => {
    const sim = new Sim(physics);
    sim.lift(200);
    spread(sim);
    sim.run(5);
    expect(sim.player.stamina).toBe(1);
  });

  it('refills in the configured time once the parrot is standing', () => {
    const sim = new Sim(physics);
    sim.run(0.3);
    sim.player.stamina = 0;
    sim.run(cfg.staminaRefillTime.value / 2);
    expect(sim.player.stamina).toBeCloseTo(0.5, 1);
    sim.run(cfg.staminaRefillTime.value / 2 + 0.1);
    expect(sim.player.stamina).toBe(1);
  });

  it('does not refill in the air', () => {
    const sim = new Sim(physics);
    sim.lift(200);
    spread(sim);
    sim.player.stamina = 0.3;
    sim.run(3);
    expect(sim.player.stamina).toBeCloseTo(0.3, 5);
  });

  it('can be switched off', () => {
    cfg.staminaEnabled.value = 0;
    const sim = new Sim(physics);
    sim.lift(500);
    sim.hands(ARM, HEAD_Y + 0.3, 0);
    const gains = flap(sim, cfg.flapsPerFullStamina.value + 4);
    expect(sim.player.stamina).toBe(1);
    expect(gains[gains.length - 1]).toBeGreaterThan(gains[0] * 0.8);
  });
});

describe('one-wing roll', () => {
  /** Glide, then tuck one arm in while the other stays out. */
  function rollWith(tucked: 'left' | 'right'): Sim {
    const sim = new Sim(physics);
    sim.lift(200);
    spread(sim);
    sim.run(2);
    sim.input.hands[tucked].position.set(tucked === 'left' ? -0.1 : 0.1, HEAD_Y - 0.3, -0.1);
    return sim;
  }

  it.each([
    ['left', 1],
    ['right', -1],
  ] as const)('rolls and curves toward the tucked %s wing, losing lift', (tucked, turn) => {
    const sim = rollWith(tucked);
    sim.run(0.5);
    expect(sim.player.movementState).toBe('rolling');
    expect(sim.player.wings.rolling).toBe(turn);
    expect(sim.player.wings.roll * turn).toBeGreaterThan(1);
    // Heading was -z; a left turn swings it toward -x.
    expect(sim.player.velocity.x * -turn).toBeGreaterThan(0.5);
    // Falling much faster than a glide, but held to the roll's own limit.
    expect(sim.player.velocity.y).toBeLessThan(-cfg.glideSinkRate.value * 2);
    sim.run(2);
    expect(sim.player.velocity.y).toBeGreaterThanOrEqual(-cfg.rollFallSpeed.value - 1e-6);
  });

  it('goes round in a spiral rather than straight down', () => {
    const sim = rollWith('left');
    const start = sim.player.position.clone();
    let farthest = 0;
    sim.run(360 / cfg.rollTurnRate.value, () => {
      farthest = Math.max(farthest, Math.hypot(sim.player.position.x - start.x, sim.player.position.z - start.z));
    });
    // After one full turn it is back near where it began, having swung out wide.
    expect(farthest).toBeGreaterThan(1);
    expect(Math.hypot(sim.player.position.x - start.x, sim.player.position.z - start.z)).toBeLessThan(farthest * 0.5);
    expect(sim.player.position.y).toBeLessThan(start.y - 5);
  });

  it('recovers the glide and levels the body when both arms spread again', () => {
    const sim = rollWith('right');
    sim.run(0.8);
    spread(sim);
    sim.run(1.5);
    expect(sim.player.movementState).toBe('gliding');
    expect(sim.player.wings.rolling).toBe(0);
    expect(sim.player.velocity.y).toBeCloseTo(-cfg.glideSinkRate.value, 1);
    // Level again: a whole number of turns.
    const turns = sim.player.wings.roll / (Math.PI * 2);
    expect(Math.abs(turns - Math.round(turns))).toBeLessThan(0.01);
  });

  it('does not start on the ground or with both arms tucked', () => {
    const grounded = new Sim(physics);
    grounded.input.hands.left.position.set(-0.1, HEAD_Y - 0.3, -0.1);
    grounded.input.hands.right.position.set(ARM, SHOULDER, 0);
    grounded.run(1);
    expect(grounded.player.wings.rolling).toBe(0);
    expect(grounded.player.wings.roll).toBeCloseTo(0, 3);

    const diving = new Sim(physics);
    diving.lift(200);
    diving.hands(0.1, HEAD_Y - 0.3, -0.1);
    diving.run(1);
    expect(diving.player.wings.rolling).toBe(0);
    expect(diving.player.movementState).toBe('diving');
  });
});
