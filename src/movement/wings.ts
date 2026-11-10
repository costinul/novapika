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
  const threshold = cfg.flapSpeedThreshold.value;
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
  w.flapping =
    left >= 0 &&
    right >= 0 &&
    Math.abs(left - right) <= cfg.flapSyncWindow.value / 1000 &&
    !state.claws.left.planted &&
    !state.claws.right.planted;
}

/**
 * How much the arms are acting as spread wings (0..1), and the bank between
 * them (-1..1, positive when the left hand is lower).
 *
 * Measured from the head but not from where it looks, so the player can
 * look around freely while gliding.
 */
export function wingPose(input: MoveInput, cfg: MovementConfig): { glide: number; bank: number } {
  const head = input.head;
  const l = input.hands.left.position;
  const r = input.hands.right.position;
  const lx = l.x - head.x;
  const lz = l.z - head.z;
  const rx = r.x - head.x;
  const rz = r.z - head.z;
  const lOut = Math.hypot(lx, lz);
  const rOut = Math.hypot(rx, rz);

  const tuck = cfg.wingTuckDistance.value;
  const range = Math.max(0.01, cfg.wingSpreadDistance.value - tuck);
  const spread = Math.min(saturate((lOut - tuck) / range), saturate((rOut - tuck) / range));

  // The hands must be on opposite sides of the head: full at 120 degrees
  // apart or more, nothing at 90 degrees or less.
  const cos = lOut > 1e-6 && rOut > 1e-6 ? (lx * rx + lz * rz) / (lOut * rOut) : 1;
  const opposite = saturate(-cos / 0.5);

  const meanHeight = (l.y + r.y) / 2 - head.y;
  const level = saturate((meanHeight + cfg.glideArmsDown.value) / ARMS_DOWN_BAND);

  pose.glide = spread * opposite * level;
  const spacing = Math.max(0.3, Math.hypot(rx - lx, rz - lz));
  pose.bank = Math.min(1, Math.max(-1, (r.y - l.y) / spacing / FULL_BANK));
  return pose;
}
const pose = { glide: 0, bank: 0 };

/**
 * Change the velocity of a player that no claw is holding, for one step:
 * flap lift, gravity, and the glide (reduced sink, forward speed, steering).
 */
export function applyAir(state: MoveState, input: MoveInput, cfg: MovementConfig, dt: number): void {
  const v = state.velocity;
  const w = state.wings;

  if (w.flapping) {
    const speed = Math.min(cfg.flapSpeedCap.value, w.sinkSpeed.left, w.sinkSpeed.right);
    v.y += cfg.flapPower.value * speed * dt;
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

  const { glide, bank } = wingPose(input, cfg);
  w.glide = state.grounded ? 0 : glide;

  const before = v.y;
  v.y -= cfg.gravity.value * dt;
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
