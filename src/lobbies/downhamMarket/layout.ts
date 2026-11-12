import type {
  FlockDef,
  GateDef,
  LobbyContent,
  PeckableDef,
  RingDef,
  TargetDef,
  ToyDef,
  Vec3,
} from '../../world/types';
import { roofTop, row } from '../town';
import type { Building, Look } from '../town';
import { makeTree } from '../trees';
import type { Limb, Tree } from '../trees';

// Where everything in Downham Market is. Plain numbers only, no drawing, so
// the same layout drives the scenery, the colliders, the toys and the tests.
//
// A toy town, not a map: the things a child knows it by, not to scale. North
// is -z and east is +x. By distance from the middle:
//    0 m     the clock tower
//    7 m     market stalls round it
//   11 m     ring course, in the air round the tower
//   18 m     the edge of the market place: shops, and the Town Hall to the west
//   27-44 m  greens behind the shops: trees, the pond, the bird table, the toy box
//   44-50 m  houses all round, with the gate in a gap to the south

export const SIZE = 100; // m, the town is SIZE x SIZE
export const HEIGHT = 30; // m, to the unseen ceiling
export const HALF = SIZE / 2;

/** Half the width of the market place. */
export const PLAZA = 18;
/** How deep the shops round the market place are. */
const SHOP_DEPTH = 9;
/** The far side of the shops from the market place. */
export const RING = PLAZA + SHOP_DEPTH;
/** Half the gap the four streets leave between the shops. */
export const STREET = 5;
/** Half the width of a street's roadway; the rest of the gap is pavement. */
export const ROAD = 3.5;
/** How deep the houses round the edge are. */
const EDGE_DEPTH = 6;
/** The near side of the houses round the edge. */
export const EDGE = HALF - EDGE_DEPTH;
/** Half the gap in the southern houses that the gate stands in. */
const GATE_GAP = 9;

const polar = (angleDeg: number, distance: number): [number, number] => {
  const a = (angleDeg * Math.PI) / 180;
  return [Math.cos(a) * distance, Math.sin(a) * distance];
};

// --- Buildings ---------------------------------------------------------------

const CARR = 0xa8612f; // carrstone, the ginger-brown stone of the town
const CARR_DARK = 0x8d4f27;
const CREAM = 0xeadfc4;
const BRICK = 0xb55a3c;
const PALE = 0xd9cdb4;
const GREEN = 0x2f6b4f;
const BLUE = 0x2d5d8c;
const RED = 0xa63a3a;
const CHARCOAL = 0x3a3a44;
const MUSTARD = 0xd8a330;
const PURPLE = 0x6b4a8c;

const SHOP_LINE = PLAZA + SHOP_DEPTH / 2;

/** The shops round the market place, their fronts toward it. The west side's northern half is the Town Hall. */
export const SHOPS: Building[] = [
  // North side.
  ...row('s', -SHOP_LINE, SHOP_DEPTH, [-RING, -19, -12, -STREET], [[8, CARR, GREEN], [10, CREAM, RED], [7, BRICK, BLUE]]),
  ...row('s', -SHOP_LINE, SHOP_DEPTH, [STREET, 13, 20, RING], [[9, CARR, MUSTARD], [7, CREAM, CHARCOAL], [10, CARR_DARK, GREEN]]),
  // South side.
  ...row('n', SHOP_LINE, SHOP_DEPTH, [-RING, -18, -11, -STREET], [[7, BRICK, PURPLE], [9, CARR, BLUE], [8, CREAM, GREEN]]),
  ...row('n', SHOP_LINE, SHOP_DEPTH, [STREET, 12, 20, RING], [[8, CARR, RED], [10, BRICK, CHARCOAL], [7, CREAM, MUSTARD]]),
  // East side.
  ...row('w', SHOP_LINE, SHOP_DEPTH, [-PLAZA, -11, -STREET], [[8, CREAM, BLUE], [9, CARR, PURPLE]]),
  ...row('w', SHOP_LINE, SHOP_DEPTH, [STREET, 11, PLAZA], [[7, CARR, GREEN], [9, BRICK, MUSTARD]]),
  // West side, south of the street.
  ...row('e', -SHOP_LINE, SHOP_DEPTH, [STREET, 12, PLAZA], [[9, CREAM, RED], [8, CARR, CHARCOAL]]),
];

const EDGE_LINE = HALF - EDGE_DEPTH / 2;
const HOUSE_LOOKS: readonly Look[] = [[8, CARR], [10, CREAM], [7, BRICK], [9, PALE], [11, CARR_DARK], [8, CREAM], [9, CARR], [7, PALE], [10, BRICK], [8, CARR]];
const TEN_CUTS = [-50, -40, -30, -20, -10, 0, 10, 20, 30, 40, 50];
const SIDE_CUTS = [-EDGE, -33, -22, -11, 0, 11, 22, 33, EDGE];

/** The plain houses all round the edge, their fronts toward the town. The unseen wall is behind them. */
export const HOUSES: Building[] = [
  ...row('s', -EDGE_LINE, EDGE_DEPTH, TEN_CUTS, HOUSE_LOOKS),
  // The southern row leaves a gap for the gate.
  ...row('n', EDGE_LINE, EDGE_DEPTH, [-50, -40, -30, -20, -GATE_GAP], HOUSE_LOOKS.slice(3, 7)),
  ...row('n', EDGE_LINE, EDGE_DEPTH, [GATE_GAP, 20, 30, 40, 50], HOUSE_LOOKS.slice(5, 9)),
  ...row('w', EDGE_LINE, EDGE_DEPTH, SIDE_CUTS, HOUSE_LOOKS.slice(1, 9)),
  ...row('e', -EDGE_LINE, EDGE_DEPTH, SIDE_CUTS, HOUSE_LOOKS.slice(2, 10)),
];

/**
 * The Town Hall, on the west side of the market place: white brick with
 * panels of brown carrstone, and a front that rises to a cupola.
 */
export const TOWN_HALL = {
  body: { x: -24.5, z: -11.5, w: 13, d: 13, h: 9, wall: 0xefe6d0, front: 'e' } as Building,
  /** The middle of the front stands taller than the rest: its footprint, and its top. */
  bay: { x: -19.5, z: -11.5, w: 3, d: 5, top: 11.5 },
  /** The cupola on the bay: the side of its square, and the heights of its top, its roof's point and its vane. */
  cupola: { side: 1.6, top: 13.1, point: 14.6, vane: 15.4 },
};

// --- The clock tower -----------------------------------------------------------

/**
 * The clock tower, in the middle of the market place: cast iron, black and
 * white, with an eight-sided base and shaft, a clock with four faces and a
 * pointed roof. Heights are of the top of each part. The clock is turned an
 * eighth of a turn, so its faces look along the diagonals.
 */
export const TOWER = {
  /** Two stone steps round the foot. */
  steps: [
    { radius: 2.6, top: 0.3 },
    { radius: 2.1, top: 0.6 },
  ],
  base: { radius: 1.25, top: 2.8 },
  shaft: { radius: 0.8, top: 8 },
  /** The clock: a cube, with a face on each side. */
  clock: { side: 2.2, top: 10.2, face: 0.85 },
  /** The ledge round the foot of the roof, wide enough to hide something on. */
  ledge: { side: 3, top: 10.4 },
  roof: { radius: 1.6, point: 12.7 },
  vane: 13.7,
};

// --- The market ------------------------------------------------------------------

export interface Stall {
  /** Middle of its footprint, on the ground. */
  x: number;
  z: number;
  /** Turn about the vertical axis: its long side runs round the tower. */
  yaw: number;
  /** Colour of its awning. */
  color: number;
}

export const STALL = {
  /** The table: length, height and depth. */
  table: [2.2, 0.8, 1.0] as Vec3,
  /** The awning: length, thickness and depth, and the height of its top. */
  awning: [2.8, 0.12, 2.0] as Vec3,
  top: 2.36,
};

const STALL_COLORS = [0xd9483b, 0x3f7fc4, 0x4fa35a, 0xe7b23a, 0xe07a2f, 0x8a5fc0];
/** Six stalls round the tower. The ways in from the north and the south are left clear. */
export const STALLS: Stall[] = STALL_COLORS.map((color, i) => {
  const angle = i * 60;
  const [x, z] = polar(angle, 7);
  const a = (angle * Math.PI) / 180;
  return { x, z, yaw: Math.atan2(-Math.cos(a), -Math.sin(a)), color };
});

/** A point on a stall: `along` its length and `across` its depth from its middle, at a height. */
export function onStall(stall: Stall, along: number, across: number, y: number): Vec3 {
  const sin = Math.sin(stall.yaw);
  const cos = Math.cos(stall.yaw);
  return [stall.x + along * cos + across * sin, y, stall.z - along * sin + across * cos];
}

/** Lamp posts at the corners of the market place: where each stands, and how tall. */
export const LAMP_HEIGHT = 4.6;
export const LAMPS: Vec3[] = [
  [13, 0, -13],
  [-13, 0, -13],
  [13, 0, 13],
  [-13, 0, 13],
];

// --- The greens ------------------------------------------------------------------

/** The middle of each corner green, behind the shops. */
const GREEN_AT = (RING + EDGE) / 2;

export const POND: Vec3 = [GREEN_AT, 0.03, -GREEN_AT];
export const POND_RADIUS = 3;

/** The bird table: a tray on a stone. This is the top of the stone. */
export const FEEDER: Vec3 = [-GREEN_AT, 0.25, -GREEN_AT + 4];

export const TOY_BOX: Vec3 = [GREEN_AT, 0, GREEN_AT];

/** The town sign, beside the street up from the gate: the foot of its post, and the middle of its board. */
export const SIGN = { post: [7, 0, 37] as Vec3, height: 3.6, width: 2.6, board: 1.3 };

/** [x, z, height, trunk radius] */
const TREE_SPOTS: readonly (readonly [number, number, number, number])[] = [
  [-38, -38, 13, 0.6],
  [-31, -33, 9, 0.5],
  [-37, 33, 11, 0.55],
  [-31, 38, 8, 0.45],
  [31, 31, 10, 0.5],
  [39, -30, 8, 0.45],
  [-35.5, 15, 12, 0.55],
  [35.5, 14, 9, 0.5],
];

export const TREES: Tree[] = TREE_SPOTS.map(([x, z, height, radius], i) => makeTree(x, z, 0, height, radius, 3.2, 300 + i));

// --- The gate ------------------------------------------------------------------

/** The gate home, in the gap in the southern houses. It faces the town, so a player flies into it heading south. */
export const GATE: GateDef = { position: [0, 0, HALF - 1.6], yaw: Math.PI };

/** Where a player starts if they come straight here, or fall out of the world: in the market place, facing the tower. */
export const SPAWNS: Vec3[] = [0, 1, -1, 2, -2, 3, -3, 4].map((step) => [step * 0.8, 0, 14]);
export const SPAWN = SPAWNS[0];

// --- Things to do ------------------------------------------------------------------

const RING_HEIGHTS = [4, 6, 9, 12, 9, 6, 4, 7];

/** The ring course: round the tower, above the stalls. */
const rings: RingDef[] = RING_HEIGHTS.map((y, i) => {
  const angle = 22.5 + i * 45;
  const [x, z] = polar(angle, 11);
  // Face along the circle, so the course is flown round the tower.
  return { id: `ring-${i + 1}`, position: [x, y, z], yaw: (-angle * Math.PI) / 180, radius: 1.3 };
});

const BELL_RADIUS = 0.12;
const BELL_STRING = 0.4;
/** A bell hanging from a point, such as the end of an arm. */
function bellUnder(id: string, hook: Vec3): PeckableDef {
  return {
    id,
    kind: 'bell',
    position: [hook[0], hook[1] - BELL_STRING - BELL_RADIUS, hook[2]],
    radius: BELL_RADIUS,
    stringLength: BELL_STRING,
  };
}

/** Height of the arm on the tower's shaft that a bell hangs from. */
export const TOWER_ARM = 7.2;
/** The post by the street up from the gate, with a bell at beak height. */
export const GATE_BELL_POST: Vec3 = [-5.5, 0, 40];
/** The lamp post that has a bell on a second arm. */
export const BELL_LAMP = LAMPS[0];

/** Where each bell's string is tied. The scenery puts something solid there. */
export const BELL_HOOKS: Record<string, Vec3> = {
  // The two low bells hang at beak height for a parrot standing below them.
  'bell-gate': [GATE_BELL_POST[0] + 0.5, 1.1, GATE_BELL_POST[2]],
  'bell-hall': [TOWN_HALL.body.x + TOWN_HALL.body.w / 2 + 0.6, 1.1, TOWN_HALL.body.z + 4],
  'bell-stall': onStall(STALLS[1], 0.9, 0, STALL.top - STALL.awning[1] - 0.06),
  'bell-lamp': [BELL_LAMP[0] + 0.8, LAMP_HEIGHT - 0.26, BELL_LAMP[2]],
  'bell-tower': [0, TOWER_ARM - 0.06, 1.5],
};

const peckables: PeckableDef[] = Object.entries(BELL_HOOKS).map(([id, hook]) => bellUnder(id, hook));

const TOYS_ONLY = ['woodBlock', 'bellBall', 'ropeKnot', 'bottleCap', 'feather'];
const FOOD = ['seed', 'millet'];

const targets: TargetDef[] = [
  { id: 'toy-box', kind: 'toyBox', position: TOY_BOX, size: [1.6, 0.35, 1.1], color: 0x4fc7b5, accepts: TOYS_ONLY },
  { id: 'feeder', kind: 'feeder', position: FEEDER, size: [1.1, 0.1, 1.1], color: 0xf2c14e, accepts: FOOD },
];

/** On a stall's table. */
const onTable = (stall: number, along: number, lift: number): Vec3 => onStall(STALLS[stall], along, 0, STALL.table[1] + lift);
const above = (p: Vec3, dy: number): Vec3 => [p[0], p[1] + dy, p[2]];

/** The tallest of the houses on the north side. */
const TALL_HOUSE = HOUSES.find((house) => house.front === 's' && house.h === 11)!;

/** Where the four bottle caps are hidden: high, and out of the way. */
export const CAP_SPOTS: Vec3[] = [
  // On the ledge under the tower's roof, at a corner.
  [TOWER.ledge.side / Math.SQRT2 - 0.3, TOWER.ledge.top, 0],
  // On top of the Town Hall's front, beside the cupola.
  [TOWN_HALL.bay.x - 1, TOWN_HALL.bay.top, TOWN_HALL.bay.z + 1.9],
  // On the roof of the tallest house, on the far side of the town, away from its chimney.
  [TALL_HOUSE.x - TALL_HOUSE.w / 4, roofTop(TALL_HOUSE), TALL_HOUSE.z],
  // On top of the gate's arch.
  [GATE.position[0], 4.34, GATE.position[2] + 0.8],
];

const toys: ToyDef[] = [
  // Wooden blocks, scattered for tidying up.
  { id: 'block-1', type: 'woodBlock', position: [3, 0.07, 12] },
  { id: 'block-2', type: 'woodBlock', position: [-9, 0.07, -3] },
  { id: 'block-3', type: 'woodBlock', position: [14, 0.07, 4] },
  { id: 'block-4', type: 'woodBlock', position: [-33, 0.07, 30] },
  { id: 'block-5', type: 'woodBlock', position: [30, 0.07, -38] },
  // Bell balls.
  { id: 'ball-1', type: 'bellBall', position: [-4, 0.08, -13] },
  { id: 'ball-2', type: 'bellBall', position: [11, 0.08, -11] },
  { id: 'ball-3', type: 'bellBall', position: [-36, 0.08, -28] },
  { id: 'ball-4', type: 'bellBall', position: [2, 0.08, 36] },
  // Rope knots.
  { id: 'knot-1', type: 'ropeKnot', position: onTable(3, -0.6, 0.08) },
  { id: 'knot-2', type: 'ropeKnot', position: [-14, 0.08, 12] },
  { id: 'knot-3', type: 'ropeKnot', position: [36, 0.08, 6] },
  // Shiny bottle caps, hidden in hard-to-reach places.
  ...CAP_SPOTS.map((spot, i): ToyDef => ({ id: `cap-${i + 1}`, type: 'bottleCap', position: above(spot, 0.06) })),
  // Seeds and millet, on the market stalls and about the greens, to carry to the bird table.
  { id: 'seed-1', type: 'seed', position: onTable(0, 0.5, 0.05) },
  { id: 'seed-2', type: 'seed', position: onTable(2, -0.4, 0.05) },
  { id: 'seed-3', type: 'seed', position: onTable(4, 0.3, 0.05) },
  { id: 'seed-4', type: 'seed', position: [33, 0.05, 28] },
  { id: 'millet-1', type: 'millet', position: onTable(5, 0, 0.05) },
  { id: 'millet-2', type: 'millet', position: [-30, 0.05, 6] },
  { id: 'millet-3', type: 'millet', position: [8, 0.05, -34] },
  // Feathers.
  { id: 'feather-1', type: 'feather', position: [-2, 0.05, 15] },
  { id: 'feather-2', type: 'feather', position: [32, 0.05, -31] },
  { id: 'feather-3', type: 'feather', position: [-12, 0.05, 36] },
];

// --- The town's own parrots ------------------------------------------------------

/** A little over half way out along a branch, on top of it. */
const onBranch = ({ a, b, radiusA, radiusB }: Limb): Vec3 => {
  const t = 0.55;
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t + (radiusA + radiusB) / 2 + 0.02, a[2] + (b[2] - a[2]) * t];
};

const onRoof = (building: Building): Vec3 => [building.x, roofTop(building), building.z];

/** Places for the parrots to perch: on the stalls, the roofs and the trees, and about the market place. */
const flockSpots: Vec3[] = [
  ...STALLS.map((stall): Vec3 => [stall.x, STALL.top, stall.z]),
  onRoof(TOWN_HALL.body),
  onRoof(SHOPS[1]),
  onRoof(SHOPS[5]),
  onRoof(SHOPS[10]),
  ...TREES.slice(0, 5).flatMap((tree) => tree.branches.slice(0, 3).map(onBranch)),
  // On the tower's steps, and on the ground.
  [0, TOWER.steps[1].top, 1.7],
  [5, 0, 15],
  [-12, 0, -9],
  [15, 0, -2],
  [-33, 0, -24],
  [30, 0, 36],
];

const FLOCK: FlockDef = {
  spots: flockSpots,
  parrots: [
    { id: 'flock-budgie-1', characterId: 'budgie', home: 0, follows: true },
    { id: 'flock-budgie-2', characterId: 'skyBudgie', home: 3, mimics: true },
    { id: 'flock-cockatoo-1', characterId: 'cockatoo', home: 6 },
    { id: 'flock-macaw-1', characterId: 'macaw', home: 7 },
  ],
};

export const CONTENT: LobbyContent = {
  toyTypes: {
    woodBlock: { shape: 'box', size: 0.13, color: 0xe8b06a, density: 300, bounce: 0.2 },
    bellBall: { shape: 'ball', size: 0.15, color: 0xff5fa2, density: 200, bounce: 0.6, jingles: true },
    ropeKnot: { shape: 'knot', size: 0.15, color: 0xf3ead2, density: 120, bounce: 0.3, dangles: true },
    bottleCap: { shape: 'cap', size: 0.1, color: 0xd9e4ff, density: 400, bounce: 0.3, glints: true },
    seed: { shape: 'seed', size: 0.08, color: 0x8a5a2b, density: 300, bounce: 0.2 },
    millet: { shape: 'millet', size: 0.24, color: 0xe2c044, density: 150, bounce: 0.2 },
    feather: { shape: 'feather', size: 0.26, color: 0xf7f3e8, density: 40, bounce: 0.05, floatiness: 0.9 },
  },
  toys,
  targets,
  peckables,
  rings,
  water: [{ id: 'pond', position: POND, radius: POND_RADIUS }],
  flock: FLOCK,
  gate: GATE,
};
