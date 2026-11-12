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
 * - toyBox, feeder, eggCup: an open-topped tray; `size` is its outer width, wall height and depth.
 * - shelf: a flat board; `size` is its width, the height of the space above it, and its depth.
 * Food put in an egg cup is eaten by the egg, if there is one.
 */
export interface TargetDef {
  id: string;
  kind: 'toyBox' | 'feeder' | 'shelf' | 'eggCup';
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

/** A perch with a model of a parrot on it. Touching it makes you that parrot. */
export interface CharacterPerchDef {
  id: string;
  /** Key into the character roster. */
  characterId: string;
  /** Where the model's feet stand. */
  position: Vec3;
  /** Way the model faces, as a turn about the vertical axis in radians. */
  yaw: number;
}

/** One of the lobby's own parrots, which live there and are run by a script. */
export interface FlockParrotDef {
  id: string;
  /** Key into the character roster. */
  characterId: string;
  /** Index of the perching spot it starts on and is returned to if it gets stuck. */
  home: number;
  /** Likes to follow the player about for a while. */
  follows?: boolean;
  /** Sometimes repeats what the player says. */
  mimics?: boolean;
  /**
   * The lobby's helper parrot, which talks with the players, and its own
   * place: where it starts, stays and is returned to. That place is not one
   * of the flock's spots, so `home` is -1. A lobby has at most one.
   */
  helper?: Vec3;
}

export interface FlockDef {
  parrots: readonly FlockParrotDef[];
  /** Places to perch: where a parrot's feet go. */
  spots: readonly Vec3[];
}

/** A place where something stands, and the way it faces. */
export interface Stand {
  /** Where its feet, or its middle if it has none, go. */
  position: Vec3;
  /** Way it faces, as a turn about the vertical axis in radians. */
  yaw: number;
}

/**
 * Where a signed-in player's pets sit. One page of pets shows at a time;
 * touching a pet makes it follow the player.
 */
export interface PetCornerDef {
  /** Where each pet on the page stands. */
  perches: readonly Stand[];
  /** Arrows to touch for the page before and the page after. */
  previous: Stand;
  next: Stand;
  /** A picture shown when there are no pets to show: signed out, or no connection. */
  sign: Stand;
  /** The perches for the two parents of an egg, left and right of the cup. */
  hearts: readonly [Stand, Stand];
  /** The cup the egg lies in. `targetId` is the place in `targets` that takes its food. */
  eggCup: { position: Vec3; targetId: string };
  /** Friends' pets, one page at a time, with arrows to turn the page and a plate for the friend's name. */
  board: { places: readonly Stand[]; previous: Stand; next: Stand; name: Stand };
  /** A friend's request waiting for an answer: their pet, the pet asked for, and pads for yes and no. */
  mail: { theirs: Stand; mine: Stand; yes: Stand; no: Stand };
  /** Where a pet is set free: the perch it sits on, and the two pads held down to let it go. */
  goodbye: { perch: Stand; pads: readonly [Stand, Stand] };
}

export interface LobbyContent {
  toyTypes: Record<string, ToyTypeDef>;
  toys: readonly ToyDef[];
  targets: readonly TargetDef[];
  peckables: readonly PeckableDef[];
  rings: readonly RingDef[];
  water: readonly WaterDef[];
  characterPerches?: readonly CharacterPerchDef[];
  petCorner?: PetCornerDef;
  flock?: FlockDef;
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
