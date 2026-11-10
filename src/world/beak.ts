import { Vector3 } from 'three';
import { movementConfig } from '../config/movement';
import type { Pose } from '../player/Player';

/** The beak tip sits just in front of and below the eyes, in head space. */
export const BEAK_OFFSET = new Vector3(0, -0.1, -0.13);
/** Radius of the beak's collider, for pecking. */
export const BEAK_RADIUS = 0.05;

/** World position of the beak tip for a head pose. */
export function beakPosition(head: Pose, out: Vector3): Vector3 {
  return out.copy(BEAK_OFFSET).applyQuaternion(head.quaternion).add(head.position);
}

/**
 * World position of a carried toy: in front of the face and low, moving with
 * the head so it stays in the same low spot of the view.
 */
export function carryPosition(head: Pose, out: Vector3): Vector3 {
  return out
    .set(0, -movementConfig.carryDown.value, -movementConfig.carryForward.value)
    .applyQuaternion(head.quaternion)
    .add(head.position);
}
