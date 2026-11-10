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

/** The part of a player that movement reads and writes. `Player` is one. */
export interface MoveState {
  /** World position of the player's tracking-space origin. */
  position: Vector3;
  velocity: Vector3;
  movementState: MovementState;
  /** The body is resting on a walkable surface. */
  grounded: boolean;
  /** At least one claw carried the body during the last step. */
  supported: boolean;
  claws: Record<Handedness, ClawState>;
}

/** What movement needs from one frame of input. Positions are tracking-space. */
export interface MoveInput {
  head: Vector3;
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
