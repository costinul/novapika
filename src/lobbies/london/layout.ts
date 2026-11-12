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

// Where everything in London is. Plain numbers only, no drawing, so the same
// layout drives the scenery, the colliders, the toys and the tests.
//
// A toy London, not a map: the things a child knows it by, not to scale.
// North is -z and east is +x. The Thames runs from west to east across the
// middle. From north to south:
//   -64 m       houses along the northern edge
//   -60..-40    city blocks, and a park with the bird table
//   -36..-29    the north road
//   -23..-11    Big Ben and the Houses of Parliament, on the bank
//    -9..9      the Thames, with Westminster Bridge to the west and Tower Bridge to the east
//     9..16     the riverside walk
//    22         the London Eye
//    42..48     the south road
//    50..60     shops
//    64         houses along the southern edge, with the gate in a gap

export const SIZE = 140; // m, London is SIZE x SIZE
export const HEIGHT = 60; // m, to the unseen ceiling
export const HALF = SIZE / 2;

/** Half the width of the Thames. */
export const RIVER = 9;
/** The height of the water: the river is shallow, and lies a little below its banks. */
export const WATER_Y = -0.6;
/** How deep the houses round the edge are. */
const EDGE_DEPTH = 6;
/** The near side of the houses round the edge. */
export const EDGE = HALF - EDGE_DEPTH;
/** Half the gap in the southern houses that the gate stands in. */
const GATE_GAP = 9;

/** The two roads that run from west to east: the middle line of each, and half its width. */
export const ROADS = { north: -32.5, south: 45, half: 3.5 };

// --- Big Ben and the Houses of Parliament ----------------------------------------

/** A square stage of a tower: the length of its side, and the height of its top. */
export interface Stage {
  side: number;
  top: number;
}

/**
 * Big Ben: the clock tower at the end of the Houses of Parliament, by
 * Westminster Bridge. A square shaft, a clock with four faces, an open
 * belfry where the great bell hangs, and a roof that steps up to a point.
 */
export const BIG_BEN = {
  x: -38,
  z: -16,
  shaft: { side: 5, top: 30 },
  /** The clock: `face` is the radius of each of its four faces. */
  clock: { side: 6.2, top: 36.5, face: 2.4 },
  /** The belfry: open on every side, with a post at each corner. Its floor is the top of the clock. */
  belfry: { side: 5.4, top: 39.6, post: 0.7 },
  /** The roof, from the slab over the belfry up to the lantern and the spire. */
  roof: [
    { side: 5.8, top: 40.2 },
    { side: 4.6, top: 41.6 },
    { side: 3.6, top: 43 },
    { side: 2.6, top: 44.4 },
    { side: 1.8, top: 46.4 },
    { side: 1.2, top: 47.4 },
    { side: 0.7, top: 48.4 },
  ] as Stage[],
  finial: 50,
};

const HONEY = 0xd9bd82; // the stone of Parliament

/** The Houses of Parliament: a long hall along the bank, east of Big Ben, its front to the river. */
export const PARLIAMENT: Building = { x: -16.5, z: -17, w: 37, d: 12, h: 9, wall: HONEY, front: 's' };

/** The Victoria Tower, at the far end of Parliament from Big Ben: square, with a turret at each corner and a flag. */
export const VICTORIA_TOWER = { x: 5.5, z: -17, side: 7, top: 22, turret: 24, flag: 28 };

// --- The bridges ---------------------------------------------------------------

/** How far a bridge's deck runs onto each bank. */
const ONTO_BANK = 0.5;
/** Half the length of a bridge's deck. Its top is level with the banks. */
export const DECK_HALF = RIVER + ONTO_BANK;

/** Westminster Bridge: low and green, by Big Ben. `half` is half the width of its deck. */
export const WESTMINSTER_BRIDGE = { x: -46, half: 3 };

/** The red bus, on Westminster Bridge: the middle of its footprint, and its width, height and length. */
export const BUS = { x: -46, z: 1, w: 2.5, h: 4.4, l: 8 };

/**
 * Tower Bridge: two stone towers in the river with the road through them,
 * two blue walkways high up between the towers, and blue chains down to the
 * banks.
 */
export const TOWER_BRIDGE = {
  x: 38,
  half: 3,
  /** The towers stand this far north and south of the middle of the river. */
  towerZ: 4.5,
  /** A tower's size across the road and along it. */
  tower: { w: 5.8, d: 4 },
  /** Half the width of the way through a tower, and the height of its arch. */
  arch: { half: 1.5, top: 3.4 },
  /** The top of a tower's walls, and the stages of its roof. */
  top: 14,
  roof: [
    { side: 4.6, top: 15 },
    { side: 3.2, top: 16 },
    { side: 1.8, top: 17 },
  ] as Stage[],
  finial: 18.5,
  /** The walkways: how far each is to the side of the middle, its width, and the heights of its underside and top. */
  walkway: { aside: 1.6, w: 1.2, bottom: 11, top: 12 },
};
/** The walkways run between the towers' inner faces. */
export const WALKWAY_HALF = TOWER_BRIDGE.towerZ - TOWER_BRIDGE.tower.d / 2;

// --- The London Eye ----------------------------------------------------------------

/**
 * The London Eye: a great white wheel on the south bank, facing the river,
 * with glass capsules round its rim. It does not turn.
 */
export const EYE = {
  x: -22,
  z: 22,
  /** Height of the hub. */
  hub: 23,
  radius: 18,
  capsules: 16,
  /** A capsule: its width, height and depth, and how far its middle is outside the rim. */
  capsule: { w: 2, h: 1.5, d: 1.6, out: 1.1 },
  /** The two legs lean back from the hub to feet this far to each side and this far behind the wheel. */
  feet: { aside: 9, behind: 12 },
};

/** The middle of the capsule at each place round the wheel, starting at the top and going round clockwise as seen from the south. */
export const CAPSULES: Vec3[] = Array.from({ length: EYE.capsules }, (_, i) => {
  const a = (i / EYE.capsules) * Math.PI * 2;
  const r = EYE.radius + EYE.capsule.out;
  return [EYE.x + Math.sin(a) * r, EYE.hub + Math.cos(a) * r, EYE.z];
});

// --- Buildings ---------------------------------------------------------------

const STOCK = 0xc9a86a; // yellow London brick
const STUCCO = 0xf1ece0;
const BROWN = 0x8a5a44;
const GREY = 0xb8b2a6;
const PORTLAND = 0xe6e1d3; // white stone
const OFFICE = 0x8fa9bd;
const GREEN = 0x2f6b4f;
const BLUE = 0x2d5d8c;
const RED = 0xa63a3a;
const CHARCOAL = 0x3a3a44;
const MUSTARD = 0xd8a330;

/** City blocks: big plain buildings, north of the north road and by Tower Bridge. */
export const BLOCKS: Building[] = [
  { x: -48, z: -50, w: 24, d: 20, h: 14, wall: PORTLAND, front: 's' },
  { x: -19, z: -50, w: 22, d: 20, h: 11, wall: BROWN, front: 's', chimney: true },
  { x: 50, z: -50, w: 20, d: 20, h: 16, wall: PORTLAND, front: 's' },
  { x: 53, z: -19, w: 14, d: 14, h: 9, wall: STOCK, front: 'w', chimney: true },
  { x: 53, z: 28, w: 14, d: 20, h: 12, wall: OFFICE, front: 'w' },
];

const SHOP_LOOKS: readonly Look[] = [[9, STOCK, GREEN], [11, STUCCO, RED], [8, BROWN, BLUE], [10, STOCK, CHARCOAL], [9, STUCCO, MUSTARD]];
/** Shops along the south side of the south road, their fronts to it. The street up from the gate runs between them. */
export const SHOPS: Building[] = [
  ...row('n', 55, 10, [-60, -48, -36, -24, -15, -6], SHOP_LOOKS),
  ...row('n', 55, 10, [6, 15, 24, 36, 48, 60], [...SHOP_LOOKS].reverse()),
];

const EDGE_LINE = HALF - EDGE_DEPTH / 2;
const HOUSE_LOOKS: readonly Look[] = [[11, STOCK], [13, STUCCO], [10, BROWN], [12, GREY], [15, STUCCO], [11, STOCK], [12, BROWN], [10, STUCCO], [14, STOCK], [11, GREY], [13, BROWN], [10, STOCK], [12, STUCCO], [11, BROWN]];
const tens = (from: number, to: number): number[] => Array.from({ length: (to - from) / 10 + 1 }, (_, i) => from + i * 10);

/** The plain houses all round the edge, their fronts toward the city. The unseen wall is behind them. */
export const HOUSES: Building[] = [
  ...row('s', -EDGE_LINE, EDGE_DEPTH, tens(-70, 70), HOUSE_LOOKS),
  // The southern row leaves a gap for the gate.
  ...row('n', EDGE_LINE, EDGE_DEPTH, [...tens(-70, -20), -GATE_GAP], HOUSE_LOOKS.slice(2, 8)),
  ...row('n', EDGE_LINE, EDGE_DEPTH, [GATE_GAP, ...tens(20, 70)], HOUSE_LOOKS.slice(6, 12)),
  // The east and west rows stop at the river.
  ...row('w', EDGE_LINE, EDGE_DEPTH, [-EDGE, -53, -42, -31, -20, -10], HOUSE_LOOKS.slice(1, 6)),
  ...row('w', EDGE_LINE, EDGE_DEPTH, [10, 20, 31, 42, 53, EDGE], HOUSE_LOOKS.slice(7, 12)),
  ...row('e', -EDGE_LINE, EDGE_DEPTH, [-EDGE, -53, -42, -31, -20, -10], HOUSE_LOOKS.slice(4, 9)),
  ...row('e', -EDGE_LINE, EDGE_DEPTH, [10, 20, 31, 42, 53, EDGE], HOUSE_LOOKS.slice(0, 5)),
];

// --- Small things ----------------------------------------------------------------

/** A black cab, on the south road: the middle of its footprint. It points along the road. */
export const CAB: Vec3 = [14, 0, 46.5];
/** The red phone box and the red pillar box, by the street up from the gate. */
export const PHONE_BOX: Vec3 = [-4.7, 0, 49.2];
export const PILLAR_BOX: Vec3 = [4.8, 0, 49.2];

/** The park, north of the north road: the bird table stands in it. This is the top of its stone. */
export const FEEDER: Vec3 = [14, 0.25, -50];
/** The toy box, on the green east of the street up from the gate. */
export const TOY_BOX: Vec3 = [24, 0, 30];

/** [x, z, height, trunk radius] */
const TREE_SPOTS: readonly (readonly [number, number, number, number])[] = [
  // Along the riverside walk.
  [10, 13, 9, 0.45],
  [22, 13, 8, 0.45],
  [-58, 13, 9, 0.45],
  // The green on the south bank.
  [16, 34, 10, 0.5],
  [30, 22, 9, 0.5],
  // The park.
  [6, -44, 11, 0.55],
  [22, -56, 13, 0.6],
  [30, -42, 9, 0.5],
  // The north bank, east of Parliament.
  [20, -20, 9, 0.5],
  [32, -22, 10, 0.5],
];

export const TREES: Tree[] = TREE_SPOTS.map(([x, z, height, radius], i) => makeTree(x, z, 0, height, radius, 3, 500 + i));

// --- The gate ------------------------------------------------------------------

/** The gate home, in the gap in the southern houses. It faces the city, so a player flies into it heading south. */
export const GATE: GateDef = { position: [0, 0, HALF - 1.6], yaw: Math.PI };

/** Where a player starts if they come straight here, or fall out of the world: on the path to the river, facing Parliament. */
export const SPAWNS: Vec3[] = [0, 1, -1, 2, -2, 3, -3, 4].map((step) => [step * 0.8, 0, 20]);
export const SPAWN = SPAWNS[0];

// --- Things to do ------------------------------------------------------------------

/** The ring course: through the Eye, over the river, round Big Ben, along Parliament, between the towers of Tower Bridge and back. */
const RING_PATH: Vec3[] = [
  [-12, 7, 40],
  [EYE.x, 13, EYE.z],
  [-30, 16, 2],
  [-26, 24, -12],
  [-6, 18, -10],
  [18, 12, -4],
  [TOWER_BRIDGE.x, 6, 0],
  [52, 10, 12],
  [34, 12, 34],
  [10, 8, 42],
];

const rings: RingDef[] = RING_PATH.map((position, i) => {
  // Each ring faces along the course: from the one before it toward the one after.
  const before = RING_PATH[(i + RING_PATH.length - 1) % RING_PATH.length];
  const after = RING_PATH[(i + 1) % RING_PATH.length];
  return { id: `ring-${i + 1}`, position, yaw: Math.atan2(after[0] - before[0], after[2] - before[2]), radius: 1.3 };
});

/** A bell hanging from a point, such as the end of an arm. */
function bellUnder(id: string, hook: Vec3, radius = 0.12, stringLength = 0.4): PeckableDef {
  return { id, kind: 'bell', position: [hook[0], hook[1] - stringLength - radius, hook[2]], radius, stringLength };
}

/** The post by the street up from the gate, with a bell at beak height, and the one in the park. */
export const GATE_BELL_POST: Vec3 = [-5.5, 0, 61];
export const PARK_BELL_POST: Vec3 = [10, 0, -40];

/** Where each bell's string is tied. The scenery puts something solid there. */
export const BELL_HOOKS: Record<string, Vec3> = {
  // The great bell, under the roof of Big Ben's belfry.
  'bell-big-ben': [BIG_BEN.x, BIG_BEN.belfry.top, BIG_BEN.z],
  // The two low bells hang at beak height for a parrot standing below them.
  'bell-gate': [GATE_BELL_POST[0] + 0.5, 1.1, GATE_BELL_POST[2]],
  'bell-park': [PARK_BELL_POST[0] + 0.5, 1.1, PARK_BELL_POST[2]],
  // Under a walkway of Tower Bridge, and under the hub of the Eye.
  'bell-bridge': [TOWER_BRIDGE.x - TOWER_BRIDGE.walkway.aside, TOWER_BRIDGE.walkway.bottom, 1.2],
  'bell-eye': [EYE.x, EYE.hub - 1, EYE.z],
};

const peckables: PeckableDef[] = Object.entries(BELL_HOOKS).map(([id, hook]) =>
  id === 'bell-big-ben' ? bellUnder(id, hook, 0.5, 0.7) : bellUnder(id, hook),
);

const TOYS_ONLY = ['woodBlock', 'bellBall', 'ropeKnot', 'bottleCap', 'feather'];
const FOOD = ['seed', 'millet'];

const targets: TargetDef[] = [
  { id: 'toy-box', kind: 'toyBox', position: TOY_BOX, size: [1.6, 0.35, 1.1], color: 0x4fc7b5, accepts: TOYS_ONLY },
  { id: 'feeder', kind: 'feeder', position: FEEDER, size: [1.1, 0.1, 1.1], color: 0xf2c14e, accepts: FOOD },
];

const above = (p: Vec3, dy: number): Vec3 => [p[0], p[1] + dy, p[2]];

/** Where the four bottle caps are hidden: high, and out of the way. */
export const CAP_SPOTS: Vec3[] = [
  // On a corner of the slab over Big Ben's belfry, at the foot of its roof.
  [BIG_BEN.x + 2.55, BIG_BEN.roof[0].top, BIG_BEN.z + 2.55],
  // On top of a walkway of Tower Bridge.
  [TOWER_BRIDGE.x + TOWER_BRIDGE.walkway.aside, TOWER_BRIDGE.walkway.top, -1],
  // On top of the capsule at the top of the Eye.
  [CAPSULES[0][0], CAPSULES[0][1] + EYE.capsule.h / 2, CAPSULES[0][2]],
  // On the roof of the bus.
  [BUS.x + 0.5, BUS.h, BUS.z + 2.5],
];

const toys: ToyDef[] = [
  // Wooden blocks, scattered for tidying up.
  { id: 'block-1', type: 'woodBlock', position: [2, 0.07, 24] },
  { id: 'block-2', type: 'woodBlock', position: [-10, 0.07, 14] },
  { id: 'block-3', type: 'woodBlock', position: [30, 0.07, 36] },
  { id: 'block-4', type: 'woodBlock', position: [-20, 0.07, -27] },
  { id: 'block-5', type: 'woodBlock', position: [16, 0.07, -30.5] },
  // Bell balls.
  { id: 'ball-1', type: 'bellBall', position: [-3, 0.08, 34] },
  { id: 'ball-2', type: 'bellBall', position: [40, 0.08, 20] },
  { id: 'ball-3', type: 'bellBall', position: [26, 0.08, -48] },
  { id: 'ball-4', type: 'bellBall', position: [-36, 0.08, -27] },
  // Rope knots.
  { id: 'knot-1', type: 'ropeKnot', position: [-30, 0.08, 14] },
  { id: 'knot-2', type: 'ropeKnot', position: [44, 0.08, -26] },
  { id: 'knot-3', type: 'ropeKnot', position: [2, 0.08, 58] },
  // Shiny bottle caps, hidden in hard-to-reach places.
  ...CAP_SPOTS.map((spot, i): ToyDef => ({ id: `cap-${i + 1}`, type: 'bottleCap', position: above(spot, 0.06) })),
  // Seeds and millet, about the greens and the riverside, to carry to the bird table in the park.
  { id: 'seed-1', type: 'seed', position: [18, 0.05, 28] },
  { id: 'seed-2', type: 'seed', position: [-14, 0.05, 36] },
  { id: 'seed-3', type: 'seed', position: [26, 0.05, -18] },
  { id: 'seed-4', type: 'seed', position: [10, 0.05, -56] },
  { id: 'millet-1', type: 'millet', position: [36, 0.05, 30] },
  { id: 'millet-2', type: 'millet', position: [-40, 0.05, 14] },
  { id: 'millet-3', type: 'millet', position: [28, 0.05, -52] },
  // Feathers.
  { id: 'feather-1', type: 'feather', position: [-2, 0.05, 18] },
  { id: 'feather-2', type: 'feather', position: [14, 0.05, -44] },
  { id: 'feather-3', type: 'feather', position: [44, 0.05, 14] },
];

/** The Thames splashes all along: round patches of water, side by side from west to east. */
const water: WaterDef[] = Array.from({ length: Math.round(SIZE / (2 * RIVER)) }, (_, i) => ({
  id: `thames-${i + 1}`,
  position: [-HALF + RIVER + i * 2 * RIVER, WATER_Y + 0.03, 0] as Vec3,
  radius: RIVER,
}));

// --- London's own parrots ------------------------------------------------------

/** A little over half way out along a branch, on top of it. */
const onBranch = ({ a, b, radiusA, radiusB }: Limb): Vec3 => {
  const t = 0.55;
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t + (radiusA + radiusB) / 2 + 0.02, a[2] + (b[2] - a[2]) * t];
};

const onRoof = (building: Building, dx = 0): Vec3 => [building.x + dx, roofTop(building), building.z];

/** Places for the parrots to perch: on roofs, the bus, the bridge and the trees, and about the banks. */
const flockSpots: Vec3[] = [
  onRoof(PARLIAMENT, -10),
  onRoof(PARLIAMENT, 8),
  [BUS.x, BUS.h, BUS.z - 2],
  [TOWER_BRIDGE.x - TOWER_BRIDGE.walkway.aside, TOWER_BRIDGE.walkway.top, -0.5],
  onRoof(BLOCKS[1]),
  onRoof(BLOCKS[3]),
  onRoof(SHOPS[4]),
  onRoof(SHOPS[5]),
  ...TREES.slice(0, 6).flatMap((tree) => tree.branches.slice(0, 2).map(onBranch)),
  // On the ground.
  [4, 0, 22],
  [-12, 0, 30],
  [28, 0, 26],
  [12, 0, -38],
  [-28, 0, -27],
];

const FLOCK: FlockDef = {
  spots: flockSpots,
  parrots: [
    { id: 'flock-macaw-1', characterId: 'macaw', home: 0 },
    { id: 'flock-macaw-2', characterId: 'macaw', home: 3 },
    { id: 'flock-cockatoo-1', characterId: 'cockatoo', home: 2, mimics: true },
    { id: 'flock-budgie-1', characterId: 'budgie', home: 6, follows: true },
    { id: 'flock-budgie-2', characterId: 'skyBudgie', home: 5 },
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
