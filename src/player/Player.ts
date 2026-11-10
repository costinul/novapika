import { Quaternion, Vector3 } from 'three';

export type Handedness = 'left' | 'right';
export const HANDS: readonly Handedness[] = ['left', 'right'];

export type MovementState =
  | 'standing'
  | 'climbing'
  | 'hanging'
  | 'flapping'
  | 'gliding'
  | 'diving'
  | 'falling';

export interface Pose {
  position: Vector3;
  quaternion: Quaternion;
}

export interface HandInput {
  /** Centre of the hand (controller grip). */
  grip: Pose;
  /** Pointing ray of the hand, used for menus. */
  aim: Pose;
  /** Support: hold. */
  gripPressed: boolean;
  /** Support: bite. */
  triggerPressed: boolean;
  /** Opens and closes the debug panel. */
  menuPressed: boolean;
}

/**
 * One frame of input for a player. All poses are relative to the player's
 * own origin (their tracking space), not the world. The local player gets
 * this from the headset; later, remote players get it from the network and
 * lobby parrots from a behaviour script.
 */
export interface PlayerInput {
  head: Pose;
  hands: Record<Handedness, HandInput>;
}

export interface InputSource {
  read(out: PlayerInput): void;
}

const pose = (): Pose => ({ position: new Vector3(), quaternion: new Quaternion() });
const handInput = (): HandInput => ({
  grip: pose(),
  aim: pose(),
  gripPressed: false,
  triggerPressed: false,
  menuPressed: false,
});

export function createPlayerInput(): PlayerInput {
  return { head: pose(), hands: { left: handInput(), right: handInput() } };
}

/**
 * All state for one parrot in the world. Rendering reads only this.
 */
export class Player {
  /** World position of the player's origin (the floor point of their tracking space). */
  readonly position = new Vector3();
  readonly velocity = new Vector3();
  movementState: MovementState = 'standing';
  /** 0 = empty, 1 = full. */
  stamina = 1;
  carriedItemId: string | null = null;

  readonly input = createPlayerInput();
  /** World-space poses, derived from `position` and `input`. */
  readonly head = pose();
  readonly hands: Record<Handedness, { grip: Pose; aim: Pose }> = {
    left: { grip: pose(), aim: pose() },
    right: { grip: pose(), aim: pose() },
  };

  constructor(
    readonly id: string,
    public characterId: string,
  ) {}

  /** Recompute world poses. Call after `input` or `position` changes. */
  updateWorldPoses(): void {
    toWorld(this.input.head, this.position, this.head);
    for (const h of HANDS) {
      toWorld(this.input.hands[h].grip, this.position, this.hands[h].grip);
      toWorld(this.input.hands[h].aim, this.position, this.hands[h].aim);
    }
  }
}

// The player origin never rotates (the view is never turned by the game),
// so local to world is a translation only.
function toWorld(local: Pose, origin: Vector3, out: Pose): void {
  out.position.copy(local.position).add(origin);
  out.quaternion.copy(local.quaternion);
}
