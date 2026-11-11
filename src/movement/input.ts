import { Vector3 } from 'three';
import { HANDS } from '../player/Player';
import type { PlayerInput } from '../player/Player';
import type { MoveInput } from './types';

export const newMoveInput = (): MoveInput => ({
  head: new Vector3(),
  headForward: new Vector3(0, 0, -1),
  hands: {
    left: { position: new Vector3(), gripPressed: false },
    right: { position: new Vector3(), gripPressed: false },
  },
});

const forward = new Vector3();

/** Reduce a full frame of player input to what the movement rules need. */
export function toMoveInput(from: PlayerInput, to: MoveInput): void {
  to.head.copy(from.head.position);
  // Looking straight up or down has no horizontal direction: keep the last one.
  forward.set(0, 0, -1).applyQuaternion(from.head.quaternion).setY(0);
  if (forward.lengthSq() > 0.01) to.headForward.copy(forward).normalize();
  for (const h of HANDS) {
    to.hands[h].position.copy(from.hands[h].grip.position);
    to.hands[h].gripPressed = from.hands[h].gripPressed;
  }
}
