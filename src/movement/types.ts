import type { Vector3 } from 'three';
import type { Handedness, MovementState } from '../player/Player';

/** One claw (hand) and what it is holding on to. */
export interface ClawState {
  /** True while the claw is planted on a surface. */
  planted: boolean;
  /** World position of the hand centre where it is planted. */
  anchor: Vector3;
  /** Surface normal at the anchor, pointing away from the surface. */
  normal: Vector3;
  /** World position of the hand centre at the end of the last step. */
  last: Vector3;
}

/** What the wing rules remember between steps. */
export interface WingState {
  /** Seconds since the player was last placed. */
  time: number;
  /** False until `prev` holds a real sample. */
  tracked: boolean;
  /** Tracking-space hand positions at the last step. */
  prev: Record<Handedness, Vector3>;
  /** Smoothed downward speed of each hand, m/s. Positive is downward. */
  sinkSpeed: Record<Handedness, number>;
  /** Time each hand's current down-sweep began, or -1 when not sweeping. */
  sweepStart: Record<Handedness, number>;
  /** Both hands are sweeping down together: lift is being applied. */
  flapping: boolean;
  /** 0 = wings folded or arms down, 1 = both arms out and level. */
  glide: number;
  /** Lift of the current flap: 1 normally, less when it began with no stamina. */
  flapStrength: number;
  /** One-wing roll under way: +1 rolling to the left, -1 to the right, 0 none. */
  rolling: -1 | 0 | 1;
  /** How far the body has rolled, radians. Shown on the parrot, never on the view. */
  roll: number;
}

/** The part of a player that movement reads and writes. `Player` is one. */
export interface MoveState {
  /** World position of the player's tracking-space origin. */
  position: Vector3;
  velocity: Vector3;
  movementState: MovementState;
  /** The body is resting on a walkable surface. */
  grounded: boolean;
  /** 0 = empty, 1 = full. Flapping spends it; resting refills it. */
  stamina: number;
  /** How tiring a flap is for this parrot: 1 is normal, less is fitter. */
  flapCost: number;
  /** At least one claw carried the body during the last step. */
  supported: boolean;
  claws: Record<Handedness, ClawState>;
  wings: WingState;
  /** Skid left over from catching a surface in flight; fades to zero. */
  catchVelocity: Vector3;
  /** How fast `catchVelocity` fades, m/s2. */
  catchDecel: number;
}

/** What movement needs from one frame of input. Positions are tracking-space. */
export interface MoveInput {
  head: Vector3;
  /** Horizontal unit vector the head is facing. */
  headForward: Vector3;
  hands: Record<Handedness, { position: Vector3; gripPressed: boolean }>;
}

export interface CastHit {
  /** Distance travelled before touching. */
  distance: number;
  /** Surface normal at the touch point. Valid until the next query. */
  normal: Vector3;
}

export interface SurfaceHit {
  /** Nearest point on any surface. Valid until the next query. */
  point: Vector3;
  /** Direction from the surface out toward the query point. */
  normal: Vector3;
  /** Distance from the query point to the surface; negative when inside a solid. */
  distance: number;
}

/** Everything movement is allowed to ask the world. */
export interface WorldQueries {
  /** Sweep a sphere along a unit direction. */
  castSphere(origin: Vector3, direction: Vector3, maxDistance: number, radius: number): CastHit | null;
  /** Nearest surface to a point, if one is within maxDistance. */
  nearestSurface(point: Vector3, maxDistance: number): SurfaceHit | null;
}
