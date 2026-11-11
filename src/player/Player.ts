import { Quaternion, Vector3 } from 'three';
import type { ClawState, MoveState, WingState } from '../movement/types';

export type Handedness = 'left' | 'right';
export const HANDS: readonly Handedness[] = ['left', 'right'];

export type MovementState =
  | 'standing'
  | 'climbing'
  | 'hanging'
  | 'flapping'
  | 'gliding'
  | 'diving'
  | 'rolling'
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
const claw = (): ClawState => ({
  planted: false,
  anchor: new Vector3(),
  normal: new Vector3(0, 1, 0),
  last: new Vector3(),
});
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
export class Player implements MoveState {
  /** World position of the player's origin (the floor point of their tracking space). */
  readonly position = new Vector3();
  readonly velocity = new Vector3();
  movementState: MovementState = 'standing';
  /** 0 = empty, 1 = full. */
  stamina = 1;
  /** How tiring a flap is for this parrot: 1 is normal, less is fitter. */
  flapCost = 1;
  carriedItemId: string | null = null;
  /** The body is resting on a walkable surface. */
  grounded = false;
  /** At least one claw carried the body during the last simulation step. */
  supported = false;
  readonly claws: Record<Handedness, ClawState> = { left: claw(), right: claw() };
  readonly wings: WingState = {
    time: 0,
    tracked: false,
    prev: { left: new Vector3(), right: new Vector3() },
    sinkSpeed: { left: 0, right: 0 },
    sweepStart: { left: -1, right: -1 },
    flapping: false,
    glide: 0,
    flapStrength: 1,
    rolling: 0,
    roll: 0,
  };
  /** 0..1, raised for a moment by a stunt; lifts the crest. */
  excitement = 0;
  /** False for the lobby's own parrots, which a behaviour script drives. */
  human = true;
  readonly catchVelocity = new Vector3();
  catchDecel = 0;

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

  /**
   * Recompute world poses from `input`. `origin` is where the player's
   * tracking space sits in the world; the engine passes a smoothed position
   * for drawing.
   */
  updateWorldPoses(origin: Vector3 = this.position): void {
    toWorld(this.input.head, origin, this.head);
    for (const h of HANDS) {
      toWorld(this.input.hands[h].grip, origin, this.hands[h].grip);
      toWorld(this.input.hands[h].aim, origin, this.hands[h].aim);
    }
  }
}

// The player origin never rotates (the view is never turned by the game),
// so local to world is a translation only.
function toWorld(local: Pose, origin: Vector3, out: Pose): void {
  out.position.copy(local.position).add(origin);
  out.quaternion.copy(local.quaternion);
}
