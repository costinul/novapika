import type {
  FlockDef,
  GateDef,
  LobbyContent,
  PeckableDef,
  RingDef,
  TargetDef,
  ToyDef,
  Vec3,
  WaterDef,
} from '../../world/types';
import { roofTop, row } from '../town';
import type { Building, Look } from '../town';
import { makeTree } from '../trees';
import type { Limb, Tree } from '../trees';

// Where everything in New York is. Plain numbers only, no drawing, so the
// same layout drives the scenery, the colliders, the toys and the tests.
//
// A toy New York, not a map: the things a child knows it by, not to scale.
// North is -z and east is +x. An avenue runs north from the gate, and a
// street crosses it from west to east; where they meet is Times Square.
//    x < 46       the city: Times Square in the middle, the Empire State
//                 Building to the north-west, a park to the north-east
//    x 40..46     the walk along the harbour
//    x > 46       the harbour, with the Statue of Liberty on its island

export const SIZE = 140; // m, New York is SIZE x SIZE
export const HEIGHT = 60; // m, to the unseen ceiling
export const HALF = SIZE / 2;

/** Where the land ends and the harbour begins, to the east. */
export const SHORE = 46;
/** The height of the water: the harbour is shallow, and lies a little below the land. */
export const WATER_Y = -0.6;
/** Half the width of the avenue and of the street that crosses it. */
export const ROAD = 4;
/** How deep the houses round the edge are. */
const EDGE_DEPTH = 6;
/** The near side of the houses round the edge. */
export const EDGE = HALF - EDGE_DEPTH;
/** Half the gap in the southern houses that the gate stands in. */
const GATE_GAP = 9;

/** Times Square: the paved place where the avenue and the street meet. */
export const SQUARE = { west: -14, east: 14, north: -20, south: 16 };

/** A square stage of a tower: the length of its side, and the height of its top. */
export interface Stage {
  side: number;
  top: number;
}

// --- The landmarks ---------------------------------------------------------------

/**
 * The Empire State Building: the tall thing to climb. It steps in as it goes
 * up, and each step leaves a ledge to land on.
 */
export const EMPIRE = {
  x: -36,
  z: -34,
  tiers: [
    { side: 14, top: 8 },
    { side: 11, top: 30 },
    { side: 8, top: 44 },
    { side: 5, top: 50 },
    { side: 3, top: 53 },
  ] as Stage[],
  /** The top of the mast. */
  mast: 58,
};

/** The narrow tower at the north end of Times Square, covered in billboards, with the ball on a pole on its roof. */
export const ONE_TIMES_SQUARE = { x: 0, z: -25.5, side: 7, top: 26, ball: 28.8 };

/** The red steps at the north end of the square: each step is one higher and one further north than the last. */
export const RED_STEPS = { x: 0, z: -12, width: 6, rise: 0.4, run: 0.8, count: 6 };
/** The top step of the red steps: where feet go. */
export const STEPS_TOP: Vec3 = [
  RED_STEPS.x,
  RED_STEPS.rise * RED_STEPS.count,
  RED_STEPS.z - RED_STEPS.run * (RED_STEPS.count - 1),
];

const BILLBOARD_WALL = 0x4a4f5c;

/** The four tall buildings on Times Square, their fronts covered in billboards. */
export const SQUARE_BUILDINGS: Building[] = [
  { x: -20, z: -12.5, w: 12, d: 15, h: 26, wall: BILLBOARD_WALL, front: 'e' },
  { x: -20, z: 10.5, w: 12, d: 11, h: 18, wall: BILLBOARD_WALL, front: 'e' },
  { x: 20, z: -12.5, w: 12, d: 15, h: 22, wall: BILLBOARD_WALL, front: 'w' },
  { x: 20, z: 10.5, w: 12, d: 11, h: 30, wall: BILLBOARD_WALL, front: 'w' },
];

/**
 * The Statue of Liberty, on her island in the harbour, facing the city: a
 * stone base, a tall pedestal, the statue in her robe, and her torch held up.
 */
export const LIBERTY = {
  x: 58,
  z: 10,
  /** The radius of the island. Its top is level with the land. */
  island: 7,
  base: { side: 7, top: 2 },
  pedestal: { side: 4, top: 9 },
  /** The robe: its radius at the foot and at the shoulders, and the height of the shoulders. */
  robe: { foot: 1.3, shoulder: 0.85, top: 15.6 },
  /** The height of the middle of her head, and of the flame of her torch. */
  head: 16.6,
  torch: 20.4,
};

// --- Buildings ---------------------------------------------------------------

const BROWNSTONE = 0x8a4b38;
const BRICK = 0xb55a3c;
const TAN = 0xc9a86a;
const CONCRETE = 0xb8b2a6;
const PALE = 0xe6e1d3;
const STEEL = 0x7f93a8;
const GREEN = 0x2f6b4f;
const BLUE = 0x2d5d8c;
const RED = 0xa63a3a;
const CHARCOAL = 0x3a3a44;

/** City blocks: big plain buildings, away from the square. Each has windows on every side. */
export const BLOCKS: Building[] = [
  { x: -52, z: -14, w: 14, d: 14, h: 16, wall: BROWNSTONE, front: 's' },
  { x: -42, z: 30, w: 20, d: 24, h: 20, wall: BRICK, front: 'e' },
  { x: 28, z: 42, w: 20, d: 20, h: 24, wall: CONCRETE, front: 'w' },
  { x: 33, z: -15, w: 14, d: 14, h: 18, wall: STEEL, front: 's' },
  { x: -14, z: -48, w: 14, d: 16, h: 14, wall: TAN, front: 'e' },
];

const SHOP_LOOKS: readonly Look[] = [[10, BROWNSTONE, GREEN], [12, TAN, RED]];
/** Shops either side of the avenue up from the gate, their fronts to it. */
export const SHOPS: Building[] = [
  ...row('e', -11, 10, [46, 53, 60], SHOP_LOOKS),
  ...row('w', 11, 10, [46, 53, 60], [[11, BRICK, BLUE], [9, PALE, CHARCOAL]]),
];

const EDGE_LINE = HALF - EDGE_DEPTH / 2;
const HOUSE_LOOKS: readonly Look[] = [[11, BROWNSTONE], [13, TAN], [10, BRICK], [12, CONCRETE], [15, BROWNSTONE], [11, PALE], [12, BRICK], [10, TAN], [14, BROWNSTONE], [11, CONCRETE], [13, BRICK], [10, PALE], [12, BROWNSTONE]];
const tens = (from: number, to: number): number[] => Array.from({ length: (to - from) / 10 + 1 }, (_, i) => from + i * 10);

/** The plain houses along the north, south and west edges, their fronts toward the city. The harbour is the east edge. */
export const HOUSES: Building[] = [
  ...row('s', -EDGE_LINE, EDGE_DEPTH, [...tens(-70, 40), SHORE], HOUSE_LOOKS.slice(0, 12)),
  // The southern row leaves a gap for the gate.
  ...row('n', EDGE_LINE, EDGE_DEPTH, [...tens(-70, -20), -GATE_GAP], HOUSE_LOOKS.slice(2, 8)),
  ...row('n', EDGE_LINE, EDGE_DEPTH, [GATE_GAP, 20, 30, 40, SHORE], HOUSE_LOOKS.slice(6, 10)),
  ...row('e', -EDGE_LINE, EDGE_DEPTH, [-EDGE, -54, -44, -32, -20, -10, 0, 10, 20, 32, 44, 54, EDGE], HOUSE_LOOKS.slice(1, 13)),
];

// --- Small things ----------------------------------------------------------------

/** A yellow taxi: the middle of its footprint, and whether it points along the street (east-west) or the avenue. */
export interface Taxi {
  x: number;
  z: number;
  alongX: boolean;
}

export const TAXIS: Taxi[] = [
  { x: -2, z: 42, alongX: false },
  { x: 2, z: 26, alongX: false },
  { x: -24, z: 2, alongX: true },
  { x: 30, z: -2, alongX: true },
  { x: 2, z: -44, alongX: false },
];

/** The bird table, in the park to the north-east. This is the top of its stone. */
export const FEEDER: Vec3 = [24, 0.25, -46];
/** The toy box, on the green south-east of the square. */
export const TOY_BOX: Vec3 = [26, 0, 24];

/** [x, z, height, trunk radius] */
const TREE_SPOTS: readonly (readonly [number, number, number, number])[] = [
  // The park.
  [14, -38, 10, 0.5],
  [32, -40, 12, 0.55],
  [18, -56, 13, 0.6],
  [34, -56, 9, 0.5],
  // The green south-west of the square.
  [-22, 26, 10, 0.5],
  [-14, 38, 9, 0.5],
  // The green south-east of the square, and the walk along the harbour.
  [12, 26, 9, 0.45],
  [43, 20, 8, 0.45],
  [43, -40, 9, 0.45],
];

export const TREES: Tree[] = TREE_SPOTS.map(([x, z, height, radius], i) => makeTree(x, z, 0, height, radius, 3, 700 + i));

// --- The gate ------------------------------------------------------------------

/** The gate home, in the gap in the southern houses. It faces the city, so a player flies into it heading south. */
export const GATE: GateDef = { position: [0, 0, HALF - 1.6], yaw: Math.PI };

/** Where a player starts if they come straight here, or fall out of the world: in Times Square, facing the red steps. */
export const SPAWNS: Vec3[] = [0, 1, -1, 2, -2, 3, -3, 4].map((step) => [step * 0.8, 0, 10]);
export const SPAWN = SPAWNS[0];

// --- Things to do ------------------------------------------------------------------

/** The ring course: up the avenue through Times Square, round the Empire State Building, over the park, out round the statue and back. */
const RING_PATH: Vec3[] = [
  [0, 6, 32],
  [0, 8, 6],
  [-14, 16, -24],
  [-36, 34, -17],
  [-52, 40, -38],
  [-32, 30, -56],
  [8, 18, -46],
  [42, 12, -22],
  [LIBERTY.x + 6.5, 12, LIBERTY.z],
  [40, 9, 30],
];

const rings: RingDef[] = RING_PATH.map((position, i) => {
  // Each ring faces along the course: from the one before it toward the one after.
  const before = RING_PATH[(i + RING_PATH.length - 1) % RING_PATH.length];
  const after = RING_PATH[(i + 1) % RING_PATH.length];
  return { id: `ring-${i + 1}`, position, yaw: Math.atan2(after[0] - before[0], after[2] - before[2]), radius: 1.3 };
});

/** A bell hanging from a point, such as the end of an arm. */
function bellUnder(id: string, hook: Vec3): PeckableDef {
  const radius = 0.12;
  const stringLength = 0.4;
  return { id, kind: 'bell', position: [hook[0], hook[1] - stringLength - radius, hook[2]], radius, stringLength };
}

/** Posts with a bell at beak height: by the avenue up from the gate, in the park, on the top of the red steps and on the statue's island. */
export const BELL_POSTS: Record<string, Vec3> = {
  'bell-gate': [-5.5, 0, 62],
  'bell-park': [20, 0, -34],
  'bell-steps': [STEPS_TOP[0] + 2.4, STEPS_TOP[1], STEPS_TOP[2]],
  'bell-liberty': [LIBERTY.x - 5, 0, LIBERTY.z + 2.5],
};

const TOP_TIER = EMPIRE.tiers[EMPIRE.tiers.length - 1];
/** Height of the arm near the top of the Empire State Building that a bell hangs from. */
export const EMPIRE_ARM = TOP_TIER.top - 0.6;

/** Where each bell's string is tied. The scenery puts something solid there. */
export const BELL_HOOKS: Record<string, Vec3> = {
  ...Object.fromEntries(
    Object.entries(BELL_POSTS).map(([id, [x, y, z]]): [string, Vec3] => [id, [x + 0.5, y + 1.1, z]]),
  ),
  // High on the Empire State Building, over the last ledge.
  'bell-empire': [EMPIRE.x + TOP_TIER.side / 2 + 0.7, EMPIRE_ARM - 0.06, EMPIRE.z],
};

const peckables: PeckableDef[] = Object.entries(BELL_HOOKS).map(([id, hook]) => bellUnder(id, hook));

const TOYS_ONLY = ['woodBlock', 'bellBall', 'ropeKnot', 'bottleCap', 'feather'];
const FOOD = ['seed', 'millet'];

const targets: TargetDef[] = [
  { id: 'toy-box', kind: 'toyBox', position: TOY_BOX, size: [1.6, 0.35, 1.1], color: 0x4fc7b5, accepts: TOYS_ONLY },
  { id: 'feeder', kind: 'feeder', position: FEEDER, size: [1.1, 0.1, 1.1], color: 0xf2c14e, accepts: FOOD },
];

const above = (p: Vec3, dy: number): Vec3 => [p[0], p[1] + dy, p[2]];

/** Where the four bottle caps are hidden: high, and out of the way. */
export const CAP_SPOTS: Vec3[] = [
  // On the very top of the Empire State Building, at the foot of its mast.
  [EMPIRE.x + 1, TOP_TIER.top, EMPIRE.z + 1],
  // On the roof of the tower with the ball.
  [ONE_TIMES_SQUARE.x - 2.4, ONE_TIMES_SQUARE.top, ONE_TIMES_SQUARE.z + 2.4],
  // On the statue's pedestal, at her feet.
  [LIBERTY.x - 1.6, LIBERTY.pedestal.top, LIBERTY.z + 1.6],
  // On the roof of the tallest building on Times Square.
  [SQUARE_BUILDINGS[3].x + 3, roofTop(SQUARE_BUILDINGS[3]), SQUARE_BUILDINGS[3].z],
];

const toys: ToyDef[] = [
  // Wooden blocks, scattered for tidying up.
  { id: 'block-1', type: 'woodBlock', position: [6, 0.07, 12] },
  { id: 'block-2', type: 'woodBlock', position: [-9, 0.07, 2] },
  { id: 'block-3', type: 'woodBlock', position: [-18, 0.07, 30] },
  { id: 'block-4', type: 'woodBlock', position: [34, 0.07, 26] },
  { id: 'block-5', type: 'woodBlock', position: [-30, 0.07, -22] },
  // Bell balls.
  { id: 'ball-1', type: 'bellBall', position: [9, 0.08, -8] },
  { id: 'ball-2', type: 'bellBall', position: [-10, 0.08, 40] },
  { id: 'ball-3', type: 'bellBall', position: [26, 0.08, -50] },
  { id: 'ball-4', type: 'bellBall', position: [43, 0.08, 2] },
  // Rope knots.
  { id: 'knot-1', type: 'ropeKnot', position: [STEPS_TOP[0] - 2, STEPS_TOP[1] + 0.08, STEPS_TOP[2]] },
  { id: 'knot-2', type: 'ropeKnot', position: [16, 0.08, 30] },
  { id: 'knot-3', type: 'ropeKnot', position: [-48, 0.08, -24] },
  // Shiny bottle caps, hidden in hard-to-reach places.
  ...CAP_SPOTS.map((spot, i): ToyDef => ({ id: `cap-${i + 1}`, type: 'bottleCap', position: above(spot, 0.06) })),
  // Seeds and millet, about the greens and on the statue's island, to carry to the bird table in the park.
  { id: 'seed-1', type: 'seed', position: [-20, 0.05, 34] },
  { id: 'seed-2', type: 'seed', position: [20, 0.05, 22] },
  { id: 'seed-3', type: 'seed', position: [LIBERTY.x - 5.5, 0.05, LIBERTY.z - 2] },
  { id: 'seed-4', type: 'seed', position: [28, 0.05, -36] },
  { id: 'millet-1', type: 'millet', position: [-12, 0.05, 28] },
  { id: 'millet-2', type: 'millet', position: [42, 0.05, -10] },
  { id: 'millet-3', type: 'millet', position: [12, 0.05, -52] },
  // Feathers.
  { id: 'feather-1', type: 'feather', position: [-3, 0.05, 13] },
  { id: 'feather-2', type: 'feather', position: [22, 0.05, -42] },
  { id: 'feather-3', type: 'feather', position: [-26, 0.05, 40] },
];

/** The harbour splashes all along: round patches of water, side by side from north to south. */
const POOL = (HALF - SHORE) / 2;
const water: WaterDef[] = Array.from({ length: Math.ceil(SIZE / (2 * POOL)) }, (_, i) => ({
  id: `harbour-${i + 1}`,
  position: [SHORE + POOL, WATER_Y + 0.03, -HALF + POOL + i * 2 * POOL] as Vec3,
  radius: POOL,
}));

// --- New York's own parrots ------------------------------------------------------

/** A little over half way out along a branch, on top of it. */
const onBranch = ({ a, b, radiusA, radiusB }: Limb): Vec3 => {
  const t = 0.55;
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t + (radiusA + radiusB) / 2 + 0.02, a[2] + (b[2] - a[2]) * t];
};

const onRoof = (building: Building, dx = 0): Vec3 => [building.x + dx, roofTop(building), building.z];

/** Places for the parrots to perch: on roofs, the red steps, the ledges of the Empire State Building and the trees, and about the streets. */
const flockSpots: Vec3[] = [
  STEPS_TOP,
  onRoof(SQUARE_BUILDINGS[1]),
  onRoof(SQUARE_BUILDINGS[2]),
  // The first ledge of the Empire State Building, and the top of the statue's base.
  [EMPIRE.x + EMPIRE.tiers[0].side / 2 - 0.7, EMPIRE.tiers[0].top, EMPIRE.z],
  [LIBERTY.x - LIBERTY.base.side / 2 + 0.7, LIBERTY.base.top, LIBERTY.z],
  onRoof(BLOCKS[0]),
  onRoof(BLOCKS[3]),
  onRoof(SHOPS[1]),
  ...TREES.slice(0, 6).flatMap((tree) => tree.branches.slice(0, 2).map(onBranch)),
  // On the ground.
  [5, 0, 6],
  [-8, 0, -6],
  [24, 0, 30],
  [-18, 0, 24],
  [22, 0, -38],
];

const FLOCK: FlockDef = {
  spots: flockSpots,
  parrots: [
    { id: 'flock-macaw-1', characterId: 'macaw', home: 3 },
    { id: 'flock-cockatoo-1', characterId: 'cockatoo', home: 0, mimics: true },
    { id: 'flock-cockatoo-2', characterId: 'cockatoo', home: 4 },
    { id: 'flock-budgie-1', characterId: 'budgie', home: 1, follows: true },
    { id: 'flock-budgie-2', characterId: 'skyBudgie', home: 7 },
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
  water,
  flock: FLOCK,
  gate: GATE,
};
