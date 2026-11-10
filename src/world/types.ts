// The data a lobby uses to describe its toys and interactive objects.
// Everything here is plain data, so a new lobby can bring its own.

export type Vec3 = readonly [number, number, number];

export interface ToyTypeDef {
  shape: 'box' | 'ball';
  /** Edge length for a box, diameter for a ball, in metres. */
  size: number;
  color: number;
  /** kg/m3. Toys are light. */
  density: number;
  /** 0 = lands dead, 1 = bounces back fully. */
  bounce: number;
  /** Makes a jingle when knocked or dropped. */
  jingles?: boolean;
}

export interface ToyDef {
  /** Stable id, unique in the lobby. */
  id: string;
  /** Key into the lobby's toy types. */
  type: string;
  /** Start position, and where the toy returns to if it is lost. */
  position: Vec3;
}

/** A place toys can be put: an open-topped box standing on the ground. */
export interface TargetDef {
  id: string;
  kind: 'toyBox';
  /** Centre of the box's floor. */
  position: Vec3;
  /** Outer width, height and depth. */
  size: Vec3;
  color: number;
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

export interface LobbyContent {
  toyTypes: Record<string, ToyTypeDef>;
  toys: readonly ToyDef[];
  targets: readonly TargetDef[];
  peckables: readonly PeckableDef[];
}
