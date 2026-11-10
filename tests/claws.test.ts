import { Vector3 } from 'three';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { movementConfig } from '../src/config/movement';
import { PhysicsWorld } from '../src/engine/physics';
import { clawCorrection, placeAt, stepMovement } from '../src/movement/step';
import type { MoveInput } from '../src/movement/types';
import { Player } from '../src/player/Player';

// Claw movement driven by synthetic hand traces against real collision
// geometry: a floor, a wall and a pole. No headset needed.

const DT = 1 / 120;
const cfg = movementConfig;
const R = cfg.handRadius.value;
const HEAD_Y = 1.6;
/** Tracking-space height of the virtual ground while the body rests on it. */
const GROUND_Y = HEAD_Y - cfg.bodyHeight.value;
const WALL_Z = -0.6; // world z of the wall face the player climbs
const POLE_Z = -0.7;
const POLE_RADIUS = 0.12;

let physics: PhysicsWorld;
let player: Player;
let input: MoveInput;
let time: number;

beforeAll(async () => {
  physics = await PhysicsWorld.create();
});

function build(obstacle: 'none' | 'wall' | 'pole'): void {
  physics.clear();
  physics.addStaticBox([0, -0.5, 0], [20, 0.5, 20]);
  if (obstacle === 'wall') physics.addStaticBox([0, 5, WALL_Z - 0.25], [3, 5, 0.25]);
  if (obstacle === 'pole') physics.addStaticCylinder([0, 5, POLE_Z], 5, POLE_RADIUS);
  physics.step(DT);

  player = new Player('test', 'nova');
  input = {
    head: new Vector3(0, HEAD_Y, 0),
    headForward: new Vector3(0, 0, -1),
    hands: {
      left: { position: new Vector3(-0.25, GROUND_Y + 0.3, -0.3), gripPressed: false },
      right: { position: new Vector3(0.25, GROUND_Y + 0.3, -0.3), gripPressed: false },
    },
  };
  placeAt(player, input, cfg, new Vector3(0, 0, 0));
  time = 0;
}

/** Run the simulation, letting `trace` move the hands before every step. */
function run(seconds: number, trace?: (t: number) => void): void {
  const end = time + seconds;
  while (time < end - 1e-9) {
    time += DT;
    trace?.(time);
    stepMovement(player, input, physics, cfg, DT);
  }
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * Math.min(1, Math.max(0, t));
const bodyBottom = (): number => player.position.y + HEAD_Y - cfg.bodyHeight.value;

beforeEach(() => build('none'));

describe('resting', () => {
  it('stands still on the floor', () => {
    run(0.5);
    expect(player.movementState).toBe('standing');
    expect(player.grounded).toBe(true);
    expect(bodyBottom()).toBeCloseTo(0, 2);
    expect(player.velocity.length()).toBeLessThan(0.2);
  });

  it('never falls through the floor, even at top speed', () => {
    player.position.y += 5;
    for (const h of ['left', 'right'] as const) player.claws[h].last.y += 5;
    player.velocity.set(0, -cfg.maxFlySpeed.value, 0);
    run(2);
    expect(player.grounded).toBe(true);
    expect(bodyBottom()).toBeGreaterThan(-0.005);
    expect(bodyBottom()).toBeLessThan(0.01);
  });
});

describe('pushing on the ground', () => {
  it('moves the body opposite to a planted hand and keeps the speed after', () => {
    run(0.2);
    const right = input.hands.right.position;
    const start = player.position.z;

    // Lower the hand onto the ground, pressing in slightly.
    run(0.1, (t) => (right.y = lerp(GROUND_Y + 0.3, GROUND_Y + R - 0.02, (t - 0.2) / 0.1)));
    expect(player.claws.right.planted).toBe(true);

    // Sweep it 0.5 m backward (+z) along the ground in 0.25 s.
    run(0.25, (t) => (right.z = lerp(-0.3, 0.2, (t - 0.3) / 0.25)));
    expect(player.position.z - start).toBeLessThan(-0.4);
    expect(player.claws.left.planted).toBe(false);

    // Lift the hand: the body carries on forward.
    run(0.05, (t) => (right.y = lerp(GROUND_Y + R - 0.02, GROUND_Y + 0.3, (t - 0.55) / 0.05)));
    expect(player.claws.right.planted).toBe(false);
    expect(player.velocity.z).toBeLessThan(-0.8);
  });

  it('jumps when both hands push down fast and let go', () => {
    run(0.2);
    const { left, right } = input.hands;
    const setY = (y: number): void => {
      left.position.y = right.position.y = y;
    };

    run(0.1, (t) => setY(lerp(GROUND_Y + 0.3, GROUND_Y + R, (t - 0.2) / 0.1)));
    // Push 0.3 m down in 0.1 s: the body rises on the claws.
    run(0.1, (t) => setY(lerp(GROUND_Y + R, GROUND_Y + R - 0.3, (t - 0.3) / 0.1)));
    expect(bodyBottom()).toBeGreaterThan(0.25);
    // Let go by pulling the hands back up.
    run(0.05, (t) => setY(lerp(GROUND_Y + R - 0.3, GROUND_Y + R, (t - 0.4) / 0.05)));
    expect(player.movementState).toBe('falling');
    expect(player.velocity.y).toBeGreaterThan(1.5);

    let peak = 0;
    run(1.5, () => (peak = Math.max(peak, bodyBottom())));
    expect(peak).toBeGreaterThan(0.45);
    expect(player.movementState).toBe('standing');
  });
});

/**
 * Hand-over-hand climbing with no buttons. Each hand presses onto the surface
 * high up, pulls down 0.6 m, lets go and reaches up again; the two hands are
 * half a cycle apart. `touchZ` is the world z where a hand centre just touches.
 */
function climbTrace(touchZ: number, handX: number): (t: number) => void {
  const CYCLE = 0.6;
  const HIGH = HEAD_Y + 0.4;
  const LOW = HEAD_Y - 0.2;
  const t0 = time;
  const one = (pos: Vector3, phase: number, x: number): void => {
    const p = ((phase % CYCLE) + CYCLE) % CYCLE;
    let y: number;
    let off: number; // distance off the surface; negative presses in
    if (p < 0.05) [y, off] = [HIGH, lerp(0.1, -0.01, p / 0.05)];
    else if (p < 0.4) [y, off] = [lerp(HIGH, LOW, (p - 0.05) / 0.35), -0.01];
    else if (p < 0.45) [y, off] = [LOW, lerp(-0.01, 0.1, (p - 0.4) / 0.05)];
    else [y, off] = [lerp(LOW, HIGH, (p - 0.45) / 0.15), 0.1];
    // The player aims at the surface they see, so x and z follow the world.
    pos.set(x - player.position.x, y, touchZ + off - player.position.z);
  };
  return (t) => {
    one(input.hands.right.position, t - t0, handX);
    one(input.hands.left.position, t - t0 + CYCLE / 2, -handX);
  };
}

describe('climbing', () => {
  it('climbs a wall hand over hand without buttons', () => {
    build('wall');
    run(0.2);
    const startY = player.position.y;
    const states = new Set<string>();
    const trace = climbTrace(WALL_Z + R, 0.2);
    run(4, (t) => {
      trace(t);
      states.add(player.movementState);
    });
    expect(player.position.y - startY).toBeGreaterThan(2);
    expect(states.has('climbing')).toBe(true);
    expect(player.grounded).toBe(false);
  });

  it('climbs a pole hand over hand without buttons', () => {
    build('pole');
    run(0.2);
    const startY = player.position.y;
    run(4, climbTrace(POLE_Z + POLE_RADIUS + R, 0.04));
    expect(player.position.y - startY).toBeGreaterThan(2);
    expect(player.grounded).toBe(false);
  });

  it('holds on through a small drift off the wall, lets go on a clear pull away', () => {
    build('wall');
    run(0.2);
    const right = input.hands.right.position;
    right.set(0.2, HEAD_Y + 0.2, WALL_Z + R + 0.1);
    run(0.05);
    run(0.05, (t) => (right.z = lerp(WALL_Z + R + 0.1, WALL_Z + R - 0.01, (t - 0.25) / 0.05) - player.position.z));
    expect(player.claws.right.planted).toBe(true);

    const z = player.position.z;
    right.z += cfg.clawStickDistance.value / 2;
    run(0.05);
    expect(player.claws.right.planted).toBe(true);
    expect(player.position.z).toBeCloseTo(z, 3); // the wall does not pull the body in

    right.z += cfg.clawStickDistance.value;
    run(0.05);
    expect(player.claws.right.planted).toBe(false);
  });
});

describe('hold (grip)', () => {
  it('locks a planted claw so the body follows it in every direction', () => {
    const out = new Vector3();
    player.position.set(0, 0, 0);
    const claw = player.claws.right;
    claw.planted = true;
    claw.anchor.set(0.2, 1, -0.5);
    claw.normal.set(0, 0, 1);
    input.hands.right.position.set(0.2, 1, -0.3); // 0.2 m off the surface

    expect(clawCorrection(player, input, cfg, out)).toBe(0);

    input.hands.right.gripPressed = true;
    expect(clawCorrection(player, input, cfg, out)).toBe(1);
    expect(out.z).toBeCloseTo(-0.2);
  });
});
