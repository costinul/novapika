import type { Vector3 } from 'three';
import type { GateDef, Vec3 } from '../world/types';
import { PLACES } from './places';

// The shape of a gate, the same in every place. Plain numbers only, no
// drawing, so the same layout drives the scenery, the rules, the pictures
// and the tests.
//
// Everything is measured in the gate's own frame, from the middle of the
// doorway's foot: x to the right as seen by somebody facing the doorway, y
// up, z out of the doorway toward them.

/** The stone step the doorway stands on: its width, height and depth. */
export const STEP: Vec3 = [5, 0.4, 3];
/** The two pillars stand this far to each side, and this far back. */
export const PILLAR_X = 1.5;
export const PILLAR_RADIUS = 0.3;
/** Height of the beam across the pillars. */
export const BEAM_Y = 4;
export const BEAM_RADIUS = 0.28;
/** The opening a player flies through: a flat sheet between the pillars. */
export const OPENING = {
  halfWidth: PILLAR_X - PILLAR_RADIUS,
  bottom: STEP[1],
  top: BEAM_Y - BEAM_RADIUS,
  z: -0.8,
};

/** A picture on the board is a square this wide. */
export const PICTURE = 0.5;
/** From the middle of one picture to the next: a gap between them, so one touch cannot pick two. */
export const PICTURE_STEP = 0.62;
/** Height of a picture's middle: about the beak of a parrot standing on the ground. */
export const PICTURE_Y = 0.55;
/** The middle of the board: on the ground, to the left of the step. */
export const BOARD_X = -4;
export const BOARD_Z = 0.6;
/**
 * A beak or hand this close in front of a picture picks it. A parrot's body
 * keeps its beak a little over 0.2 m from the board it stands at.
 */
export const REACH = 0.3;

/**
 * Where a player's feet are put on arriving: at the front of the step, with
 * the doorway behind them. The Aviary has a perch between the two.
 */
const ARRIVAL_Z = 1.2;
/** Players who arrive one after another stand this far apart, side by side. */
const ARRIVAL_STEP = 0.5;
/** Which place along the step each player gets, from the middle outward. */
const ARRIVAL_ORDER = [0, 1, -1, 2, -2, 3, -3, 4];

export interface GateLayout {
  def: GateDef;
  /**
   * The pictures on the board, left to right: the place each leads to, and
   * the middle of the picture in the world and in the gate's own frame.
   */
  pictures: readonly { placeId: string; position: Vec3; local: Vec3 }[];
  /**
   * Where a player's feet are put on arriving, by their slot in the lobby
   * they left: friends who come through one after another do not land inside
   * each other.
   */
  arrivals: readonly Vec3[];
}

/** A point in the gate's own frame, as a point in the world. */
export function fromGate(def: GateDef, x: number, y: number, z: number): Vec3 {
  const sin = Math.sin(def.yaw);
  const cos = Math.cos(def.yaw);
  return [def.position[0] + x * cos + z * sin, def.position[1] + y, def.position[2] - x * sin + z * cos];
}

/** A point in the world, in the gate's own frame. */
export function toGate(def: GateDef, world: Vector3, out: Vector3): Vector3 {
  const sin = Math.sin(def.yaw);
  const cos = Math.cos(def.yaw);
  const dx = world.x - def.position[0];
  const dz = world.z - def.position[2];
  return out.set(dx * cos - dz * sin, world.y - def.position[1], dx * sin + dz * cos);
}

/** Is a point, given in the gate's own frame, on a picture or just in front of it? */
export function onPicture(point: Vector3, picture: Vec3): boolean {
  const out = point.z - picture[2];
  return (
    Math.abs(point.x - picture[0]) < PICTURE / 2 && Math.abs(point.y - picture[1]) < PICTURE / 2 && out > -0.1 && out < REACH
  );
}

/** Where everything about the gate of the place `here` is. */
export function gateLayout(def: GateDef, here: string): GateLayout {
  const others = PLACES.filter((id) => id !== here);
  return {
    def,
    pictures: others.map((placeId, i) => {
      const local: Vec3 = [BOARD_X + (i - (others.length - 1) / 2) * PICTURE_STEP, PICTURE_Y, BOARD_Z];
      return { placeId, position: fromGate(def, ...local), local };
    }),
    arrivals: ARRIVAL_ORDER.map((along) => fromGate(def, along * ARRIVAL_STEP, STEP[1], ARRIVAL_Z)),
  };
}
