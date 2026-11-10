import { Vector3 } from 'three';
import type { MovementConfig } from '../config/movement';
import { HANDS } from '../player/Player';
import type { Handedness } from '../player/Player';
import type { MoveInput, MoveState, WorldQueries } from './types';

// Movement is a function of (state, input, world queries, config) only, so it
// can be unit tested with synthetic hand traces. For speed it updates `state`
// in place and reuses the scratch vectors below instead of allocating.

/** Gap kept between a sphere and a surface so rounding never causes overlap. */
const SKIN = 0.001; // m
/** Surfaces at least this upright count as ground to stand on. */
const WALKABLE_NORMAL_Y = 0.7;
const MAX_SLIDES = 3;

const move = new Vector3();
const delta = new Vector3();
const dir = new Vector3();
const from = new Vector3();
const center = new Vector3();
const hand = new Vector3();
const overStick: Record<Handedness, boolean> = { left: false, right: false };

/**
 * How far the body must move so that planted claws stay where they are
 * planted. Writes the move to `out` and returns how many claws carry the body.
 *
 * A claw only pushes: motion along or into its surface moves the body the
 * opposite way, motion away from the surface is ignored until it exceeds the
 * stick distance, when `overStick` is set for that hand. A claw locked with
 * the grip button holds in every direction.
 */
export function clawCorrection(
  state: MoveState,
  input: MoveInput,
  cfg: MovementConfig,
  out: Vector3,
  overStickOut?: Record<Handedness, boolean>,
): number {
  let count = 0;
  out.set(0, 0, 0);
  for (const h of HANDS) {
    if (overStickOut) overStickOut[h] = false;
    const claw = state.claws[h];
    if (!claw.planted) continue;
    delta.copy(state.position).add(input.hands[h].position).sub(claw.anchor);
    if (!input.hands[h].gripPressed) {
      const away = delta.dot(claw.normal);
      if (away > cfg.clawStickDistance.value) {
        if (overStickOut) overStickOut[h] = true;
        continue;
      }
      if (away > 0) delta.addScaledVector(claw.normal, -away);
    }
    out.sub(delta);
    count++;
  }
  if (count > 1) out.multiplyScalar(1 / count);
  return count;
}

/** Centre of the body sphere for a given head position. */
export function bodyCenter(state: MoveState, input: MoveInput, cfg: MovementConfig, out: Vector3): Vector3 {
  out.copy(state.position).add(input.head);
  out.y -= cfg.bodyHeight.value - cfg.bodyRadius.value;
  return out;
}

/**
 * Put a player at a spawn point, at rest: the lowest of the body and the two
 * hands sits on the spawn height, so nothing starts inside the ground.
 */
export function placeAt(state: MoveState, input: MoveInput, cfg: MovementConfig, spawn: Vector3): void {
  let lowest = input.head.y - cfg.bodyHeight.value;
  for (const h of HANDS) lowest = Math.min(lowest, input.hands[h].position.y - cfg.handRadius.value);
  state.position.set(spawn.x - input.head.x, spawn.y - lowest + SKIN, spawn.z - input.head.z);
  state.velocity.set(0, 0, 0);
  state.grounded = false;
  state.supported = false;
  for (const h of HANDS) {
    state.claws[h].planted = false;
    state.claws[h].last.copy(state.position).add(input.hands[h].position);
  }
}

/** Advance one player by one fixed step. */
export function stepMovement(
  state: MoveState,
  input: MoveInput,
  world: WorldQueries,
  cfg: MovementConfig,
  dt: number,
): void {
  const bodyRadius = cfg.bodyRadius.value;
  const handRadius = cfg.handRadius.value;

  // 1. Claws. Planted claws carry the body; otherwise it flies free.
  const carrying = clawCorrection(state, input, cfg, move, overStick) > 0;
  for (const h of HANDS) {
    if (!overStick[h]) continue;
    const claw = state.claws[h];
    claw.planted = false;
    claw.last.copy(state.position).add(input.hands[h].position);
  }

  if (!carrying) {
    if (state.supported) {
      // The claws just let go: keep the push speed, with a little extra.
      state.velocity.multiplyScalar(cfg.jumpMultiplier.value).clampLength(0, cfg.maxPushSpeed.value);
    }
    state.velocity.y -= cfg.gravity.value * dt;
    if (state.grounded) {
      const keep = Math.exp(-cfg.groundFriction.value * dt);
      state.velocity.x *= keep;
      state.velocity.z *= keep;
    }
    state.velocity.clampLength(0, cfg.maxFlySpeed.value);
    move.copy(state.velocity).multiplyScalar(dt);
  }
  state.supported = carrying;

  // 2. Body. The player may have physically stepped or leaned into something:
  // push the body out first, then move it, sliding along whatever it hits.
  bodyCenter(state, input, cfg, center);
  const overlap = world.nearestSurface(center, bodyRadius);
  if (overlap) {
    state.position.addScaledVector(overlap.normal, bodyRadius - overlap.distance);
    center.addScaledVector(overlap.normal, bodyRadius - overlap.distance);
  }

  from.copy(center);
  for (let i = 0; i < MAX_SLIDES; i++) {
    const length = move.length();
    if (length < 1e-7) break;
    dir.copy(move).multiplyScalar(1 / length);
    const hit = world.castSphere(center, dir, length, bodyRadius);
    if (!hit) {
      center.add(move);
      break;
    }
    const travel = Math.max(0, hit.distance - SKIN);
    center.addScaledVector(dir, travel);
    move.addScaledVector(dir, -travel);
    const into = move.dot(hit.normal);
    if (into < 0) move.addScaledVector(hit.normal, -into);
    if (!carrying) {
      const speedInto = state.velocity.dot(hit.normal);
      if (speedInto < 0) state.velocity.addScaledVector(hit.normal, -speedInto);
    }
  }
  delta.copy(center).sub(from); // what the body actually moved
  state.position.add(delta);

  if (carrying) {
    // Track the speed the claws are giving the body, averaged over a short window.
    const blend = 1 - Math.exp(-dt / cfg.pushVelocityWindow.value);
    state.velocity.lerp(delta.multiplyScalar(1 / dt).clampLength(0, cfg.maxPushSpeed.value), blend);
  }

  const ground = world.nearestSurface(center, bodyRadius + cfg.clawContactMargin.value);
  state.grounded = !!ground && ground.normal.y >= WALKABLE_NORMAL_Y;

  // 3. Claws again: slide planted claws along their surface, plant free ones
  // that have just touched something.
  let locked = false;
  for (const h of HANDS) {
    const claw = state.claws[h];
    hand.copy(state.position).add(input.hands[h].position);

    if (claw.planted) {
      const away = delta.copy(hand).sub(claw.anchor).dot(claw.normal);
      if (away > 0) hand.addScaledVector(claw.normal, -away);
      const surface = world.nearestSurface(hand, handRadius + cfg.clawContactMargin.value);
      if (surface) {
        claw.anchor.copy(surface.point).addScaledVector(surface.normal, handRadius);
        claw.normal.copy(surface.normal);
        claw.last.copy(claw.anchor);
        locked ||= input.hands[h].gripPressed;
      } else {
        claw.planted = false;
        claw.last.copy(state.position).add(input.hands[h].position);
      }
      continue;
    }

    delta.copy(hand).sub(claw.last);
    const length = delta.length();
    const hit =
      length > 1e-7
        ? world.castSphere(claw.last, dir.copy(delta).multiplyScalar(1 / length), length, handRadius)
        : null;
    if (hit) {
      claw.planted = true;
      claw.anchor.copy(claw.last).addScaledVector(dir, Math.max(0, hit.distance - SKIN));
      claw.normal.copy(hit.normal);
      claw.last.copy(claw.anchor);
    } else {
      claw.last.copy(hand);
    }
  }

  const holding = state.claws.left.planted || state.claws.right.planted;
  state.movementState = state.grounded
    ? 'standing'
    : holding
      ? locked
        ? 'hanging'
        : 'climbing'
      : 'falling';
}
