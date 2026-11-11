import type { MovementConfig } from '../config/movement';
import { HANDS } from '../player/Player';
import type { MoveInput, MoveState } from './types';

// Wing rules: flap, glide, steer and dive. Hands in open air are wings.
// Like the rest of movement these are functions of (state, input, config).

/** A down-sweep ends when the hand slows to this share of the flap threshold. */
const SWEEP_END_RATIO = 0.5;
/** Height band over which "arms down" fades the glide out, m. */
const ARMS_DOWN_BAND = 0.2;
/** Below this horizontal speed a glide heads where the head faces, m/s. */
const MIN_HEADING_SPEED = 0.5;
/** Hand height difference over hand spacing that counts as full bank (45 degrees). */
const FULL_BANK = 1;

/** One-wing roll: the spread arm must be at least this far out, the other no more than this. */
const ROLL_WING_OUT = 0.6;
const ROLL_WING_IN = 0.25;
/** How quickly the body levels out after a roll, 1/s. */
const ROLL_RECOVER_RATE = 8;

const saturate = (x: number): number => Math.min(1, Math.max(0, x));

/**
 * Measure hand speed and detect flaps. Call every step, whether or not the
 * player is airborne, so speeds are always current.
 *
 * A flap needs both hands sweeping down faster than the threshold, with the
 * two sweeps starting within the sync window, and no claw planted. Hands
 * moving in turn, as in climbing, never satisfy this.
 */
export function trackWings(state: MoveState, input: MoveInput, cfg: MovementConfig, dt: number): void {
  const w = state.wings;
  w.time += dt;
  // Shorter arms sweep more slowly, so the bar is lower for them.
  const threshold = cfg.flapSpeedThreshold.value * state.reachScale;
  const blend = 1 - Math.exp(-dt / cfg.handSpeedSmoothing.value);

  for (const h of HANDS) {
    const pos = input.hands[h].position;
    if (w.tracked) {
      const sink = (w.prev[h].y - pos.y) / dt;
      w.sinkSpeed[h] += (sink - w.sinkSpeed[h]) * blend;
    } else {
      w.sinkSpeed[h] = 0;
    }
    w.prev[h].copy(pos);

    if (w.sweepStart[h] < 0) {
      if (w.sinkSpeed[h] > threshold) w.sweepStart[h] = w.time;
    } else if (w.sinkSpeed[h] < threshold * SWEEP_END_RATIO) {
      w.sweepStart[h] = -1;
    }
  }
  w.tracked = true;

  const { left, right } = w.sweepStart;
  const flapping =
    left >= 0 &&
    right >= 0 &&
    Math.abs(left - right) <= cfg.flapSyncWindow.value / 1000 &&
    !state.claws.left.planted &&
    !state.claws.right.planted;

  if (flapping && !w.flapping) {
    // A new flap begins: it costs stamina, and is weak if there is none left.
    if (cfg.staminaEnabled.value) {
      w.flapStrength = state.stamina > 0 ? 1 : cfg.staminaEmptyLift.value;
      state.stamina = Math.max(0, state.stamina - state.flapCost / cfg.flapsPerFullStamina.value);
    } else {
      w.flapStrength = 1;
    }
  }
  w.flapping = flapping;
}

/**
 * How much the arms are acting as spread wings (0..1), the bank between them
 * (-1..1, positive when the left hand is lower), and how far out each arm is.
 *
 * Measured from the head but not from where it looks, so the player can
 * look around freely while gliding.
 */
export function wingPose(
  input: MoveInput,
  cfg: MovementConfig,
  reachScale = 1,
): { glide: number; bank: number; leftOut: number; rightOut: number } {
  const head = input.head;
  const l = input.hands.left.position;
  const r = input.hands.right.position;
  const lx = l.x - head.x;
  const lz = l.z - head.z;
  const rx = r.x - head.x;
  const rz = r.z - head.z;
  const lOut = Math.hypot(lx, lz);
  const rOut = Math.hypot(rx, rz);

  const tuck = cfg.wingTuckDistance.value * reachScale;
  const range = Math.max(0.01, cfg.wingSpreadDistance.value * reachScale - tuck);
  pose.leftOut = saturate((lOut - tuck) / range);
  pose.rightOut = saturate((rOut - tuck) / range);
  const spread = Math.min(pose.leftOut, pose.rightOut);

  // The hands must be on opposite sides of the head: full at 120 degrees
  // apart or more, nothing at 90 degrees or less.
  const cos = lOut > 1e-6 && rOut > 1e-6 ? (lx * rx + lz * rz) / (lOut * rOut) : 1;
  const opposite = saturate(-cos / 0.5);

  const meanHeight = (l.y + r.y) / 2 - head.y;
  const level = saturate((meanHeight + cfg.glideArmsDown.value * reachScale) / (ARMS_DOWN_BAND * reachScale));

  pose.glide = spread * opposite * level;
  const spacing = Math.max(0.3, Math.hypot(rx - lx, rz - lz));
  pose.bank = Math.min(1, Math.max(-1, (r.y - l.y) / spacing / FULL_BANK));
  return pose;
}
const pose = { glide: 0, bank: 0, leftOut: 0, rightOut: 0 };

/**
 * Change the velocity of a player that no claw is holding, for one step:
 * flap lift, gravity, and the glide (reduced sink, forward speed, steering).
 */
export function applyAir(state: MoveState, input: MoveInput, cfg: MovementConfig, dt: number): void {
  const v = state.velocity;
  const w = state.wings;

  if (w.flapping) {
    // Lift and push are counted against the reach, so a child's shorter,
    // slower stroke gives as much as an adult's full one.
    const speed = Math.min(cfg.flapSpeedCap.value, w.sinkSpeed.left, w.sinkSpeed.right) / state.reachScale;
    v.y += cfg.flapPower.value * speed * w.flapStrength * dt;
    // The forward push can turn the flight and bring it up to glide speed,
    // but never makes it faster than it already was beyond that.
    const limit = Math.max(Math.hypot(v.x, v.z), cfg.glideSpeed.value);
    v.addScaledVector(input.headForward, cfg.flapForwardPush.value * speed * dt);
    const across = Math.hypot(v.x, v.z);
    if (across > limit) {
      v.x *= limit / across;
      v.z *= limit / across;
    }
  }

  const { glide, bank, leftOut, rightOut } = wingPose(input, cfg, state.reachScale);
  w.glide = state.grounded ? 0 : glide;

  const before = v.y;
  v.y -= cfg.gravity.value * dt;

  // One-wing roll: one arm out, the other tucked or stopped. The parrot
  // rolls toward the tucked wing and falls in a spiral until both spread.
  const oneWing = Math.max(leftOut, rightOut) > ROLL_WING_OUT && Math.min(leftOut, rightOut) < ROLL_WING_IN;
  w.rolling = !state.grounded && !w.flapping && oneWing ? (leftOut < rightOut ? 1 : -1) : 0;
  if (w.rolling !== 0) {
    w.roll += w.rolling * ((cfg.rollSpinRate.value * Math.PI) / 180) * dt;
    spiral(state, input, cfg, dt);
    return;
  }
  // Level out: unwind to the nearest whole turn.
  const turn = Math.PI * 2;
  w.roll -= (w.roll - Math.round(w.roll / turn) * turn) * (1 - Math.exp(-ROLL_RECOVER_RATE * dt));

  if (w.glide <= 0) return;

  // Spread wings hold the fall to the glide sink rate. Gravity cannot push
  // past that; a faster fall (from a dive) is eased back to it.
  const maxFall = cfg.maxFlySpeed.value;
  const floor = -(maxFall + (cfg.glideSinkRate.value - maxFall) * w.glide);
  let absorbed = 0;
  if (v.y < floor) {
    const from = Math.min(before, floor);
    v.y = floor + (from - floor) * Math.exp(-cfg.glideLiftRate.value * dt);
    absorbed = v.y - from;
  }

  let speed = Math.hypot(v.x, v.z);
  let dx = input.headForward.x;
  let dz = input.headForward.z;
  if (speed > MIN_HEADING_SPEED) {
    dx = v.x / speed;
    dz = v.z / speed;
  }

  // Steer: bank turns the flight path toward the lower hand.
  const angle = bank * ((cfg.glideTurnRate.value * Math.PI) / 180) * w.glide * dt;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const tx = dx * cos + dz * sin;
  dz = -dx * sin + dz * cos;
  dx = tx;

  const cruise = cfg.glideSpeed.value;
  if (speed < cruise) {
    speed = Math.min(cruise, speed + cfg.glideAcceleration.value * w.glide * dt);
  } else {
    speed = cruise + (speed - cruise) * Math.exp(-cfg.glideDrag.value * dt);
  }
  // Pulling out of a dive turns fall speed into forward speed.
  speed += cfg.diveSpeedKept.value * absorbed;

  v.x = dx * speed;
  v.z = dz * speed;
}

/** The falling spiral of a one-wing roll: no lift, a curving path, a capped fall. */
function spiral(state: MoveState, input: MoveInput, cfg: MovementConfig, dt: number): void {
  const v = state.velocity;
  v.y = Math.max(v.y, -cfg.rollFallSpeed.value);

  let speed = Math.hypot(v.x, v.z);
  let dx = input.headForward.x;
  let dz = input.headForward.z;
  if (speed > MIN_HEADING_SPEED) {
    dx = v.x / speed;
    dz = v.z / speed;
  }
  const angle = state.wings.rolling * ((cfg.rollTurnRate.value * Math.PI) / 180) * dt;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const keep = cfg.rollForwardSpeed.value;
  if (speed < keep) speed = Math.min(keep, speed + cfg.glideAcceleration.value * dt);
  v.x = (dx * cos + dz * sin) * speed;
  v.z = (-dx * sin + dz * cos) * speed;
}
