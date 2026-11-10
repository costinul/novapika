import { beforeAll, describe, expect, it } from 'vitest';
import { PhysicsWorld } from '../src/engine/physics';
import { cfg, HEAD_Y, lerp, Sim } from './harness';

// Wing movement driven by synthetic hand traces.

const ARM = 0.6; // m, hand distance out to the side with the arm spread
const SHOULDER = HEAD_Y - 0.2;
const R = cfg.handRadius.value;

let physics: PhysicsWorld;
beforeAll(async () => {
  physics = await PhysicsWorld.create();
});

/** Arms out and level: the glide pose. */
const spread = (sim: Sim): void => sim.hands(ARM, SHOULDER, 0);
/** Hands pulled in to the chest: the dive pose. */
const tuck = (sim: Sim): void => sim.hands(0.1, HEAD_Y - 0.3, -0.1);

/**
 * Height of a flapping hand: a 0.6 m downstroke in 0.2 s (3 m/s), then a
 * slower 0.4 s upstroke.
 */
function flapHeight(phase: number): number {
  const p = ((phase % 0.6) + 0.6) % 0.6;
  return p < 0.2 ? lerp(HEAD_Y + 0.3, HEAD_Y - 0.3, p / 0.2) : lerp(HEAD_Y - 0.3, HEAD_Y + 0.3, (p - 0.2) / 0.4);
}

describe('flap', () => {
  it('lifts off from standing with one strong flap', () => {
    const sim = new Sim(physics);
    sim.hands(ARM, HEAD_Y + 0.3, 0);
    sim.run(0.3);
    expect(sim.player.movementState).toBe('standing');

    const t0 = sim.time;
    let flapped = false;
    sim.run(0.2, (t) => {
      sim.hands(ARM, flapHeight(t - t0), 0);
      flapped ||= sim.player.movementState === 'flapping';
    });
    expect(flapped).toBe(true);
    expect(sim.player.grounded).toBe(false);
    expect(sim.player.velocity.y).toBeGreaterThan(3);
    // Each flap also pushes a little the way the head faces (-z).
    expect(sim.player.velocity.z).toBeLessThan(-0.5);
  });

  it('gains a lot of height from a few flaps', () => {
    const sim = new Sim(physics);
    sim.hands(ARM, HEAD_Y + 0.3, 0);
    sim.run(0.3);
    const startY = sim.player.position.y;
    const t0 = sim.time;
    sim.run(5 * 0.6, (t) => sim.hands(ARM, flapHeight(t - t0), 0));
    expect(sim.player.position.y - startY).toBeGreaterThan(4);
    expect(sim.player.velocity.length()).toBeLessThanOrEqual(cfg.maxFlySpeed.value + 1e-6);
  });

  it('gives lift only when both sweeps start within the sync window', () => {
    const gain = (offset: number): number => {
      const sim = new Sim(physics);
      sim.lift(50);
      tuck(sim);
      sim.run(0.1);
      const t0 = sim.time;
      // 0.8 m downstrokes lasting 0.4 s, the right hand starting late.
      const y = (t: number): number => lerp(HEAD_Y + 0.5, HEAD_Y - 0.3, t / 0.4);
      let best = -Infinity;
      const before = sim.player.velocity.y;
      sim.run(0.7, (t) => {
        sim.input.hands.left.position.set(-ARM, y(t - t0), 0);
        sim.input.hands.right.position.set(ARM, y(t - t0 - offset), 0);
        best = Math.max(best, sim.player.velocity.y);
      });
      return best - before;
    };
    expect(gain(0.1)).toBeGreaterThan(2);
    expect(gain(0.25)).toBeLessThanOrEqual(0);
  });

  it.each([
    ['arms out', ARM, 0],
    ['hands in front, as in climbing', 0.15, -0.3],
  ])('never gets lift from alternating hands (%s)', (_name, x, z) => {
    const sim = new Sim(physics);
    sim.lift(200);
    const t0 = sim.time;
    let flapped = false;
    let fastestUp = -Infinity;
    sim.run(4, (t) => {
      // Same stroke as a real flap, but the hands are half a cycle apart.
      sim.input.hands.left.position.set(-x, flapHeight(t - t0), z);
      sim.input.hands.right.position.set(x, flapHeight(t - t0 + 0.3), z);
      flapped ||= sim.player.wings.flapping;
      fastestUp = Math.max(fastestUp, sim.player.velocity.y);
    });
    expect(flapped).toBe(false);
    expect(fastestUp).toBeLessThanOrEqual(0);
  });

  it('gives no lift while a claw is planted', () => {
    const wallZ = -0.6;
    const sim = new Sim(physics, (p) => p.addStaticBox([0, 10, wallZ - 0.25], [3, 10, 0.25]));
    sim.run(0.2);
    const { left, right } = sim.input.hands;
    left.position.set(-0.2, HEAD_Y + 0.3, wallZ + R + 0.1);
    right.position.set(ARM, HEAD_Y + 0.3, 0);
    sim.run(0.05);
    sim.run(0.05, (t) => (left.position.z = lerp(wallZ + R + 0.1, wallZ + R - 0.01, (t - 0.25) / 0.05)));
    expect(sim.player.claws.left.planted).toBe(true);

    const t0 = sim.time;
    let flapped = false;
    sim.run(0.2, (t) => {
      left.position.y = right.position.y = flapHeight(t - t0);
      flapped ||= sim.player.wings.flapping;
    });
    expect(flapped).toBe(false);
  });
});

describe('glide', () => {
  it('sinks slowly and moves forward with arms out and level', () => {
    const sim = new Sim(physics);
    sim.lift(50);
    spread(sim);
    sim.run(3);
    expect(sim.player.movementState).toBe('gliding');
    expect(sim.player.velocity.y).toBeCloseTo(-cfg.glideSinkRate.value, 1);
    expect(sim.player.velocity.z).toBeCloseTo(-cfg.glideSpeed.value, 1);
    expect(Math.abs(sim.player.velocity.x)).toBeLessThan(0.01);
  });

  it('keeps gliding whichever way the head looks', () => {
    const sim = new Sim(physics);
    sim.lift(50);
    spread(sim);
    sim.run(2);
    sim.input.headForward.set(1, 0, 0);
    sim.run(1);
    expect(sim.player.movementState).toBe('gliding');
    expect(sim.player.velocity.z).toBeCloseTo(-cfg.glideSpeed.value, 1);
  });

  it.each([
    ['left', -1],
    ['right', 1],
  ])('turns toward the lower hand (%s)', (_name, side) => {
    const sim = new Sim(physics);
    sim.lift(50);
    spread(sim);
    sim.run(2);
    // Bank: one hand 0.3 m down, the other 0.3 m up.
    sim.input.hands.left.position.y = SHOULDER + 0.3 * side;
    sim.input.hands.right.position.y = SHOULDER - 0.3 * side;
    sim.run(1);
    expect(sim.player.velocity.x * side).toBeGreaterThan(1);
    expect(sim.speedAcross).toBeCloseTo(cfg.glideSpeed.value, 1);
    expect(sim.player.movementState).toBe('gliding');
  });

  it('lands on the ground and stands', () => {
    const sim = new Sim(physics);
    sim.lift(3);
    spread(sim);
    sim.run(6);
    expect(sim.player.movementState).toBe('standing');
    expect(sim.player.position.y + HEAD_Y - cfg.bodyHeight.value).toBeCloseTo(0, 2);
    expect(sim.player.velocity.length()).toBeLessThan(0.2);
  });
});

describe('dive', () => {
  it('builds speed with arms tucked, then pulls out and keeps the speed', () => {
    const sim = new Sim(physics);
    sim.lift(100);
    tuck(sim);
    sim.run(1.2);
    expect(sim.player.movementState).toBe('diving');
    expect(sim.player.velocity.y).toBeLessThan(-7);
    expect(sim.player.velocity.length()).toBeLessThanOrEqual(cfg.maxFlySpeed.value + 1e-6);

    spread(sim);
    sim.run(1);
    expect(sim.player.movementState).toBe('gliding');
    expect(sim.player.velocity.y).toBeCloseTo(-cfg.glideSinkRate.value, 1);
    expect(sim.speedAcross).toBeGreaterThan(cfg.glideSpeed.value + 0.5);
  });

  it('dives with arms straight down too', () => {
    const sim = new Sim(physics);
    sim.lift(100);
    sim.hands(0.3, HEAD_Y - 0.75, 0);
    sim.run(1.2);
    expect(sim.player.movementState).toBe('diving');
  });
});

describe('catch', () => {
  it('sticks to a wall hit head-on instead of bouncing', () => {
    const wallZ = -3;
    const sim = new Sim(physics, (p) => p.addStaticBox([0, 15, wallZ - 0.25], [10, 15, 0.25]));
    sim.lift(8);
    sim.player.position.z = -1.5;
    sim.input.hands.left.position.set(-0.1, HEAD_Y - 0.3, -0.1);
    sim.input.hands.right.position.set(0.2, HEAD_Y - 0.1, -0.5); // reaching ahead
    for (const h of ['left', 'right'] as const) {
      sim.player.claws[h].last.copy(sim.player.position).add(sim.input.hands[h].position);
    }
    sim.player.velocity.set(0, 0, -5);

    let away = 0;
    sim.run(0.7, () => (away = Math.max(away, sim.player.velocity.z)));
    expect(sim.player.claws.right.planted).toBe(true);
    expect(sim.player.movementState).toBe('climbing');
    expect(away).toBeLessThan(0.2); // never thrown back off the wall
    expect(sim.player.velocity.length()).toBeLessThan(0.3);
  });

  it('skids to a stop along a wall over the absorb time', () => {
    const wallZ = -0.6;
    const sim = new Sim(physics, (p) => p.addStaticBox([0, 15, wallZ - 0.25], [100, 15, 0.25]));
    sim.lift(8);
    const right = sim.input.hands.right.position;
    sim.input.hands.left.position.set(-0.1, HEAD_Y - 0.3, -0.1);
    right.set(0.2, HEAD_Y, wallZ + R + 0.1);
    sim.player.claws.right.last.copy(sim.player.position).add(right);
    sim.player.velocity.set(5, 0, 0);

    // Reach onto the wall while flying along it.
    const t0 = sim.time;
    let plantedAt: number | null = null;
    sim.run(0.1, (t) => {
      right.z = lerp(wallZ + R + 0.1, wallZ + R - 0.01, (t - t0) / 0.05);
      if (plantedAt === null && sim.player.claws.right.planted) plantedAt = sim.player.position.x;
    });
    expect(plantedAt).not.toBeNull();

    sim.run(0.1);
    expect(sim.player.velocity.x).toBeGreaterThan(0.5); // still skidding half way through
    sim.run(0.5);
    const skid = sim.player.position.x - plantedAt!;
    expect(skid).toBeGreaterThan(0.25);
    expect(skid).toBeLessThan(0.75);
    expect(sim.player.velocity.length()).toBeLessThan(0.3);
    expect(sim.player.claws.right.planted).toBe(true);
  });
});
