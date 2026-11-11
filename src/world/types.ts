// The data a lobby uses to describe its toys and interactive objects.
// Everything here is plain data, so a new lobby can bring its own.

export type Vec3 = readonly [number, number, number];

export type ToyShape = 'box' | 'ball' | 'knot' | 'cap' | 'seed' | 'millet' | 'feather';

export interface ToyTypeDef {
  shape: ToyShape;
  /** Longest dimension in metres. */
  size: number;
  color: number;
  /** kg/m3. Toys are light. */
  density: number;
  /** 0 = lands dead, 1 = bounces back fully. */
  bounce: number;
  /** Makes a jingle when knocked or dropped. */
  jingles?: boolean;
  /** Hangs and swings below the beak when carried. */
  dangles?: boolean;
  /** Glints so it can be spotted from a distance. */
  glints?: boolean;
  /** 0 falls normally; towards 1 it floats down slowly. */
  floatiness?: number;
}

export interface ToyDef {
  /** Stable id, unique in the lobby. */
  id: string;
  /** Key into the lobby's toy types. */
  type: string;
  /** Start position, and where the toy returns to if it is lost. */
  position: Vec3;
}

/**
 * A place toys can be put.
 * - toyBox, feeder: an open-topped tray; `size` is its outer width, wall height and depth.
 * - shelf: a flat board; `size` is its width, the height of the space above it, and its depth.
 */
export interface TargetDef {
  id: string;
  kind: 'toyBox' | 'feeder' | 'shelf';
  /** Centre of the underside. */
  position: Vec3;
  size: Vec3;
  /** Turn about the vertical axis, radians. */
  yaw?: number;
  color: number;
  /** Toy types that count here. Left out, every type counts. */
  accepts?: readonly string[];
}

/** Something that reacts to a peck of the beak or a knock of a hand. */
export interface PeckableDef {
  id: string;
  kind: 'bell';
  /** Centre of the bell. */
  position: Vec3;
  radius: number;
  /** Length of the string it hangs from, above the bell. */
  stringLength: number;
}

/** An upright ring to fly through. */
export interface RingDef {
  id: string;
  /** Centre of the ring. */
  position: Vec3;
  /** Direction the ring faces, as a turn about the vertical axis in radians. */
  yaw: number;
  radius: number;
}

/** A round patch of shallow water that splashes. */
export interface WaterDef {
  id: string;
  /** Centre of the water surface. */
  position: Vec3;
  radius: number;
}

export interface LobbyContent {
  toyTypes: Record<string, ToyTypeDef>;
  toys: readonly ToyDef[];
  targets: readonly TargetDef[];
  peckables: readonly PeckableDef[];
  rings: readonly RingDef[];
  water: readonly WaterDef[];
}

/** Collision shape of a toy: a ball of radius half[0], or a box of half extents. */
export function toyCollider(def: ToyTypeDef): { kind: 'box' | 'ball'; half: Vec3 } {
  const s = def.size;
  switch (def.shape) {
    case 'ball':
    case 'knot':
    case 'seed':
      return { kind: 'ball', half: [s / 2, s / 2, s / 2] };
    case 'box':
      return { kind: 'box', half: [s / 2, s / 2, s / 2] };
    case 'cap':
      return { kind: 'box', half: [s / 2, s / 8, s / 2] };
    case 'millet':
      return { kind: 'box', half: [s / 6, s / 6, s / 2] };
    case 'feather':
      return { kind: 'box', half: [s / 6, Math.max(0.01, s / 40), s / 2] };
  }
}
