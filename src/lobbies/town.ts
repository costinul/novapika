// Buildings for a town's layout, as plain numbers: boxes with flat roofs to
// land on, singly or in rows. The town's scenery draws them and makes them
// solid; see townScenery.ts.

/** The side of a building its front is on: north is -z, east is +x. */
export type Facing = 'n' | 's' | 'e' | 'w';

/** A plain box of a building with a flat roof to land on. */
export interface Building {
  /** Middle of its footprint. */
  x: number;
  z: number;
  /** Size east to west, and north to south. */
  w: number;
  d: number;
  /** Height of its walls. */
  h: number;
  /** Colour of its walls. */
  wall: number;
  front: Facing;
  /** The colour of its shop front, if it is a shop. */
  shop?: number;
  chimney?: boolean;
}

/** Thickness of the slab that tops every building. */
export const ROOF = 0.3;
/** The height of a building's roof, where feet go. */
export const roofTop = (building: Building): number => building.h + ROOF;

/** What one building in a row looks like: its height, wall colour and, for a shop, the colour of its front. */
export type Look = readonly [h: number, wall: number, shop?: number];

/**
 * A row of buildings side by side, fronts all one way. `middle` is where the
 * row's middle line runs, across the way it faces; `cuts` are where one
 * building ends and the next begins, along the row.
 */
export function row(front: Facing, middle: number, depth: number, cuts: readonly number[], looks: readonly Look[]): Building[] {
  return looks.map(([h, wall, shop], i) => {
    const along = (cuts[i] + cuts[i + 1]) / 2;
    const length = cuts[i + 1] - cuts[i];
    const acrossX = front === 'e' || front === 'w';
    return {
      x: acrossX ? middle : along,
      z: acrossX ? along : middle,
      w: acrossX ? depth : length,
      d: acrossX ? length : depth,
      h,
      wall,
      front,
      shop,
      chimney: i % 2 === 0,
    };
  });
}
