import type { StaticBuilder } from '../lobbies/build';
import {
  BEAM_RADIUS,
  BEAM_Y,
  BOARD_X,
  BOARD_Z,
  fromGate,
  OPENING,
  PICTURE,
  PICTURE_STEP,
  PICTURE_Y,
  PILLAR_RADIUS,
  PILLAR_X,
  STEP,
} from './layout';
import type { GateLayout } from './layout';

const STONE = 0xd8d2e8;
const WOOD = 0xd9a05b;

/**
 * A gate's fixed scenery, the same in every place: a stone step, two pillars
 * and a beam for the doorway, and the wooden board the pictures hang on. The
 * pictures, and the sheet in the doorway, are drawn by GateView.
 */
export function buildGate(b: StaticBuilder, { def, pictures }: GateLayout): void {
  const at = (x: number, y: number, z: number) => fromGate(def, x, y, z);

  b.box(STONE, at(0, STEP[1] / 2, 0), STEP, { yaw: def.yaw });
  for (const x of [-PILLAR_X, PILLAR_X]) {
    b.limb(STONE, at(x, STEP[1], OPENING.z), at(x, BEAM_Y, OPENING.z), PILLAR_RADIUS, PILLAR_RADIUS - 0.04, { sides: 8 });
  }
  b.limb(STONE, at(-PILLAR_X - 0.3, BEAM_Y, OPENING.z), at(PILLAR_X + 0.3, BEAM_Y, OPENING.z), BEAM_RADIUS, BEAM_RADIUS, {
    sides: 8,
  });
  // A flat stone on top of the beam, to land on.
  b.drum(STONE, at(0, BEAM_Y + 0.3, OPENING.z), 0.4, 0.08, 8);

  // The board: a back with a post at each end, standing on the ground.
  const width = pictures.length * PICTURE_STEP + 0.14;
  const height = PICTURE + 0.24;
  b.box(WOOD, at(BOARD_X, PICTURE_Y, BOARD_Z - 0.04), [width, height, 0.06], { yaw: def.yaw });
  for (const side of [-1, 1]) {
    const x = BOARD_X + side * (width / 2 - 0.05);
    b.limb(WOOD, at(x, 0, BOARD_Z - 0.1), at(x, PICTURE_Y + height / 2, BOARD_Z - 0.1), 0.04, 0.04, { sides: 6 });
  }
}
