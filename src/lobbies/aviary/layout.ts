import { BACK_PERCH, PERCH_ORDER } from '../../characters/roster';
import type {
  CharacterPerchDef,
  FlockDef,
  LobbyContent,
  PeckableDef,
  PetCornerDef,
  RingDef,
  Stand,
  TargetDef,
  ToyDef,
  Vec3,
} from '../../world/types';

// Where everything in the Aviary is. Plain numbers only, no drawing, so the
// same layout drives the scenery, the colliders, the toys and the tests.
//
// The player is a parrot about 0.6 m tall, so a "metre" here feels large.
// Zones by distance from the centre:
//    0-7 m   home tree with the nest
//    9-13 m  ring course, in the air
//   13-17 m  play gym, bird bath, feeder, toy box, on the ground
//   20-25 m  climbing trees
//   30 m     netting

export const SIZE = 60; // m, the Aviary is SIZE x SIZE
export const HEIGHT = 25; // m, to the netting overhead
export const HALF = SIZE / 2;

export interface Limb {
  a: Vec3;
  b: Vec3;
  radiusA: number;
  radiusB: number;
}

export interface Blob {
  center: Vec3;
  radius: number;
}

export interface Tree {
  trunk: Limb;
  branches: Limb[];
  leaves: Blob[];
  /** Outer end of each branch, lowest first. */
  tips: Vec3[];
}

/** Small repeatable random number generator, so the Aviary is always the same. */
function random(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const polar = (angleDeg: number, distance: number): [number, number] => {
  const a = (angleDeg * Math.PI) / 180;
  return [Math.cos(a) * distance, Math.sin(a) * distance];
};

/** A trunk with thick branches to perch on and leaf clumps over the branch ends. */
function makeTree(
  x: number,
  z: number,
  baseY: number,
  height: number,
  trunkRadius: number,
  reach: number,
  seed: number,
): Tree {
  const rnd = random(seed);
  const top = baseY + height;
  const trunk: Limb = { a: [x, baseY - 0.5, z], b: [x, top, z], radiusA: trunkRadius, radiusB: trunkRadius * 0.55 };
  const branches: Limb[] = [];
  const leaves: Blob[] = [];
  const tips: Vec3[] = [];

  const count = 4 + Math.floor(height / 4);
  let angle = rnd() * Math.PI * 2;
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1); // 0 = lowest branch, 1 = highest
    const y = baseY + height * (0.3 + 0.62 * t);
    angle += 2.4 + (rnd() - 0.5) * 0.8;
    const length = reach * (1 - 0.35 * t) * (0.8 + 0.2 * rnd());
    const rise = length * (0.15 + 0.25 * rnd());
    const tip: Vec3 = [x + Math.cos(angle) * length, y + rise, z + Math.sin(angle) * length];
    const radius = 0.2 + 0.1 * (1 - t);
    branches.push({ a: [x, y, z], b: tip, radiusA: radius * 1.2, radiusB: radius * 0.8 });
    tips.push(tip);
    leaves.push({ center: [tip[0], tip[1] + 1.5, tip[2]], radius: 1.2 + rnd() * 0.5 });
  }
  leaves.push({ center: [x, top + 0.8, z], radius: 1.9 + rnd() * 0.5 });
  leaves.push({ center: [x + 1, top - 0.3, z + 0.6], radius: 1.4 });
  leaves.push({ center: [x - 0.9, top - 0.1, z - 0.8], radius: 1.5 });
  return { trunk, branches, leaves, tips };
}

// --- Home tree and nest -----------------------------------------------------

export const NEST_Y = 7; // m, height of the nest floor
export const NEST_RADIUS = 2.4;
export const UPPER_TRUNK_RADIUS = 0.7;
/** Lower trunk, up to the nest. */
export const HOME_TRUNK: Limb = { a: [0, -0.5, 0], b: [0, NEST_Y - 0.3, 0], radiusA: 1.5, radiusB: 1.3 };
/** The part of the home tree above the nest. */
export const HOME_CROWN = makeTree(0, 0, NEST_Y, 8, UPPER_TRUNK_RADIUS, 5.5, 11);
/** Big low branches under the nest, to climb up by. */
export const HOME_LOW_BRANCHES: Limb[] = [40, 160, 280].map((deg, i) => {
  const [x, z] = polar(deg, 6);
  const y = 3 + i * 1.2;
  return { a: [0, y, 0], b: [x, y + 1, z], radiusA: 0.4, radiusB: 0.28 };
});

/** The middle of the arc of character perches, as an angle round the nest. */
const PERCH_ARC = -62.5;
const [spawnX, spawnZ] = polar(PERCH_ARC, 1.2);
/** In the nest, between the trunk and the perches. */
export const SPAWN: Vec3 = [spawnX, NEST_Y, spawnZ];
/**
 * Where each player in the lobby starts, so that nobody starts inside
 * anybody else: the first at `SPAWN`, the rest beside it round the
 * trunk, a little under half a metre apart, clear of the shelves.
 */
export const SPAWNS: Vec3[] = [0, 1, -1, 2, -2, 3, 4, 5].map((step) => {
  const [x, z] = polar(PERCH_ARC + step * 22, 1.2);
  return [x, NEST_Y, z];
});

/** Height of a perch's bar above the nest floor: the row in front, and the tall one behind. */
export const PERCH_HEIGHT = 0.4;
export const BACK_PERCH_HEIGHT = 0.95;

function perch(characterId: string, angleDeg: number, distance: number, height: number): CharacterPerchDef {
  const [x, z] = polar(angleDeg, distance);
  // Face the spawn point, so each parrot looks at the player.
  return {
    id: `perch-${characterId}`,
    characterId,
    position: [x, NEST_Y + height + 0.03, z],
    yaw: Math.atan2(x - spawnX, z - spawnZ),
  };
}

const [howToX, howToZ] = polar(18, 2.05);
/** A picture board at the edge of the nest showing the moves. It faces the spawn point. */
export const HOW_TO = {
  /** Centre of the board. */
  position: [howToX, NEST_Y + 1.05, howToZ] as Vec3,
  /** Turn about the vertical axis so its face looks at the spawn point. */
  yaw: Math.atan2(spawnX - howToX, spawnZ - howToZ),
  width: 1.5,
  height: 1.0,
};

/** Pick a parrot by touching it. Nova and Pika have the two middle perches. */
export const CHARACTER_PERCHES: CharacterPerchDef[] = [
  ...PERCH_ORDER.map((id, i) => perch(id, PERCH_ARC + (1.5 - i) * 21, 2.0, PERCH_HEIGHT)),
  perch(BACK_PERCH, PERCH_ARC, 2.25, BACK_PERCH_HEIGHT),
];

// --- Pet corner -------------------------------------------------------------

/** The middle of the pet rail, as an angle round the nest: across from the character perches. */
const PET_ARC = PERCH_ARC + 180;
/** The rail runs just inside the rim of the nest. */
const PET_RAIL_RADIUS = 2.3;
/** Height of the rail above the nest floor. A pet's middle is then about at beak height. */
export const PET_RAIL_HEIGHT = 0.42;
/** Degrees round the nest between one pet and the next: about half a metre. */
const PET_STEP = 13.5;
const PETS_PER_PAGE = 6;

/**
 * A place on the pet rail, facing the middle of the nest. `steps` counts pets
 * along from the rail's middle, to the right as seen from inside the nest.
 */
function onPetRail(steps: number, lift = 0): Stand {
  const [x, z] = polar(PET_ARC + steps * PET_STEP, PET_RAIL_RADIUS);
  return { position: [x, NEST_Y + PET_RAIL_HEIGHT + lift, z], yaw: Math.atan2(x, z) };
}

/** A place in the nest, at an angle round it and a distance from its middle, facing the middle. */
function inNest(angleDeg: number, distance: number, height: number): Stand {
  const [x, z] = polar(angleDeg, distance);
  return { position: [x, NEST_Y + height, z], yaw: Math.atan2(x, z) };
}

/** A place `right` metres to the right of another and `up` above it, as seen from the middle of the nest. */
function beside(stand: Stand, right: number, up = 0): Stand {
  const [x, y, z] = stand.position;
  return { position: [x - Math.cos(stand.yaw) * right, y + up, z + Math.sin(stand.yaw) * right], yaw: stand.yaw };
}

/** Height of the top of a perch for a pet, above the nest floor. */
const PET_PERCH = PET_RAIL_HEIGHT + 0.03;
/** The egg cup, with a heart perch to each side: between the pet rail and the character perches. */
const EGG_CUP = inNest(238, 1.9, 0);
export const EGG_CUP_SIZE: Vec3 = [0.46, 0.1, 0.46];
/** The friends' board stands on the rim between the pet rail and the egg cup. This is the foot of its front. */
const BOARD = inNest(195, 2.2, 0);
/** Heights of the board's two shelves above the nest floor, top one first. */
export const BOARD_SHELVES = [0.8, 0.38];
/** A friend's request shows over the middle of the pet rail. */
const MAIL = onPetRail(0, 0.52);
/** The goodbye perch stands alone, on the far side of the pet rail from everything else. */
const GOODBYE = inNest(51, 2.15, PET_PERCH);

/**
 * Everything to do with a signed-in player's pets. Their pets sit along a
 * rail, left to right; touch one and it follows you.
 */
export const PET_CORNER: PetCornerDef = {
  perches: Array.from({ length: PETS_PER_PAGE }, (_, i) => onPetRail(i - (PETS_PER_PAGE - 1) / 2, 0.03)),
  previous: onPetRail(-PETS_PER_PAGE / 2 - 0.25, 0.2),
  next: onPetRail(PETS_PER_PAGE / 2 + 0.25, 0.2),
  sign: onPetRail(0, 0.4),
  hearts: [inNest(238 - 14, 2.1, PET_PERCH), inNest(238 + 14, 2.1, PET_PERCH)],
  eggCup: { position: EGG_CUP.position, targetId: 'egg-cup' },
  board: {
    // Two shelves of three, read left to right and top to bottom.
    places: BOARD_SHELVES.flatMap((shelf) => [-1, 0, 1].map((column) => beside(BOARD, column * 0.34, shelf))),
    previous: beside(BOARD, -0.7, 0.62),
    next: beside(BOARD, 0.7, 0.62),
    name: beside(BOARD, 0, 1.22),
  },
  mail: { theirs: beside(MAIL, -0.17), mine: beside(MAIL, 0.17), yes: beside(MAIL, -0.5, 0.06), no: beside(MAIL, 0.5, 0.06) },
  goodbye: { perch: GOODBYE, pads: [beside(GOODBYE, -0.34), beside(GOODBYE, 0.34)] },
};
/** The foot of the friends' board, for the scenery to build it on. */
export const PET_BOARD: Stand = BOARD;
/** Points along the top of the rail, end to end, for the scenery to build it through. */
export const PET_RAIL: Vec3[] = Array.from(
  { length: PETS_PER_PAGE + 1 },
  (_, i) => onPetRail(i - PETS_PER_PAGE / 2).position,
);

// --- Climbing trees ---------------------------------------------------------

/** [angle in degrees, distance from centre, height, trunk radius] */
const TREE_SPOTS: readonly (readonly [number, number, number, number])[] = [
  [15, 21, 9, 0.5],
  [60, 24, 14, 0.65],
  [100, 20, 7, 0.45],
  [150, 24, 16, 0.7],
  [195, 21, 11, 0.55],
  [240, 24, 8, 0.5],
  [300, 22, 13, 0.6],
  [340, 24, 10, 0.55],
];

export const TREES: Tree[] = TREE_SPOTS.map(([angle, distance, height, radius], i) => {
  const [x, z] = polar(angle, distance);
  return makeTree(x, z, 0, height, radius, 3.5, 100 + i);
});

/** Small flat pads on a few branch ends, so something can be left there. */
export const PADS: Vec3[] = [
  above(TREES[3].tips[TREES[3].tips.length - 1], 0.2), // top of the tallest tree
  above(TREES[1].tips[2], 0.25),
  above(HOME_CROWN.tips[HOME_CROWN.tips.length - 1], 0.2),
];

function above(p: Vec3, dy: number): Vec3 {
  return [p[0], p[1] + dy, p[2]];
}

// --- Ground furniture -------------------------------------------------------

const [gymX, gymZ] = polar(125, 15);
export const GYM: Vec3 = [gymX, 0, gymZ];
export const GYM_HALF = 2.5; // m, half the gym's footprint
export const GYM_HEIGHT = 5;

const [pondX, pondZ] = polar(320, 15);
export const POND: Vec3 = [pondX, 0.03, pondZ];
export const POND_RADIUS = 3;

const [feederX, feederZ] = polar(35, 14);
export const FEEDER: Vec3 = [feederX, 0.25, feederZ]; // top of its stump

const [boxX, boxZ] = polar(215, 14);
export const TOY_BOX: Vec3 = [boxX, 0, boxZ];

/** Closed doorway to future lobbies, against the far netting. */
export const PORTAL: Vec3 = [0, 0, -HALF + 1.6];

/** The tall corner post with a lookout platform. */
export const LOOKOUT: Vec3 = [HALF - 1.2, 18, HALF - 1.2];

// --- Things to do -----------------------------------------------------------

const RING_HEIGHTS = [5, 7, 10, 13, 10, 7, 4, 6, 9, 12];

const rings: RingDef[] = RING_HEIGHTS.map((y, i) => {
  const angle = 18 + i * 36;
  const [x, z] = polar(angle, 11);
  // Face along the circle, so the course is flown round the home tree.
  return { id: `ring-${i + 1}`, position: [x, y, z], yaw: (-angle * Math.PI) / 180, radius: 1.3 };
});

const BELL_RADIUS = 0.12;
const BELL_STRING = 0.4;
/** A bell hanging from a point, such as the underside of a branch. */
function bellUnder(id: string, hook: Vec3): PeckableDef {
  return {
    id,
    kind: 'bell',
    position: [hook[0], hook[1] - BELL_STRING - BELL_RADIUS, hook[2]],
    radius: BELL_RADIUS,
    stringLength: BELL_STRING,
  };
}

/** Where each bell's string is tied. The scenery puts something solid there. */
export const BELL_HOOKS: Record<string, Vec3> = {
  // The two low bells hang at beak height for a parrot standing below them.
  'bell-nest': [-1.5, NEST_Y + 1.1, 0],
  'bell-gym': [GYM[0] + 1.6, GYM_HEIGHT - 0.13, GYM[2]],
  'bell-feeder': [feederX + 1.6, 1.1, feederZ - 1.2],
  'bell-tall-tree': [TREES[1].tips[3][0], TREES[1].tips[3][1] - 0.2, TREES[1].tips[3][2]],
  'bell-far-tree': [TREES[4].tips[2][0], TREES[4].tips[2][1] - 0.22, TREES[4].tips[2][2]],
};

const peckables: PeckableDef[] = Object.entries(BELL_HOOKS).map(([id, hook]) => bellUnder(id, hook));

const TOYS_ONLY = ['woodBlock', 'bellBall', 'ropeKnot', 'bottleCap', 'feather'];
const FOOD = ['seed', 'millet'];

/** Shelves on the trunk above the nest floor, to decorate the nest. */
const shelves: TargetDef[] = [
  [90, 0.3],
  [200, 0.3],
  [150, 1.2],
].map(([deg, up], i) => {
  const [x, z] = polar(deg, UPPER_TRUNK_RADIUS + 0.35);
  return {
    id: `nest-shelf-${i + 1}`,
    kind: 'shelf' as const,
    position: [x, NEST_Y + up, z] as Vec3,
    size: [1.0, 0.4, 0.7] as Vec3,
    yaw: -((deg * Math.PI) / 180) - Math.PI / 2,
    color: 0xc98a4b,
    accepts: TOYS_ONLY,
  };
});

const targets: TargetDef[] = [
  { id: 'toy-box', kind: 'toyBox', position: TOY_BOX, size: [1.6, 0.35, 1.1], color: 0x4fc7b5, accepts: TOYS_ONLY },
  { id: 'feeder', kind: 'feeder', position: FEEDER, size: [1.1, 0.1, 1.1], color: 0xf2c14e, accepts: FOOD },
  // Seeds and millet dropped here feed the egg.
  {
    id: PET_CORNER.eggCup.targetId,
    kind: 'eggCup',
    position: EGG_CUP.position,
    size: EGG_CUP_SIZE,
    yaw: EGG_CUP.yaw,
    color: 0xd9b98a,
    accepts: FOOD,
  },
  ...shelves,
];

/** A spot on the ground at an angle and distance from the centre. */
const ground = (angleDeg: number, distance: number, y: number): Vec3 => {
  const [x, z] = polar(angleDeg, distance);
  return [x, y, z];
};

const toys: ToyDef[] = [
  // Wooden blocks, scattered for tidying up.
  { id: 'block-1', type: 'woodBlock', position: ground(250, 9, 0.07) },
  { id: 'block-2', type: 'woodBlock', position: ground(180, 12, 0.07) },
  { id: 'block-3', type: 'woodBlock', position: ground(75, 15, 0.07) },
  { id: 'block-4', type: 'woodBlock', position: ground(5, 10, 0.07) },
  { id: 'block-5', type: 'woodBlock', position: [GYM[0] + 1, 0.07, GYM[2] - 1] },
  { id: 'block-6', type: 'woodBlock', position: [-1.0, NEST_Y + 0.07, 1.7] },
  // Bell balls.
  { id: 'ball-1', type: 'bellBall', position: ground(140, 9, 0.08) },
  { id: 'ball-2', type: 'bellBall', position: ground(290, 13, 0.08) },
  { id: 'ball-3', type: 'bellBall', position: ground(50, 19, 0.08) },
  { id: 'ball-4', type: 'bellBall', position: [GYM[0] - 1.2, 0.08, GYM[2] + 0.5] },
  // Rope knots.
  { id: 'knot-1', type: 'ropeKnot', position: [GYM[0] + 0.5, 0.08, GYM[2] + 1.8] },
  { id: 'knot-2', type: 'ropeKnot', position: ground(225, 19, 0.08) },
  { id: 'knot-3', type: 'ropeKnot', position: [1.5, NEST_Y + 0.08, -0.45] },
  { id: 'knot-4', type: 'ropeKnot', position: ground(330, 19, 0.08) },
  // Shiny bottle caps, hidden in hard-to-reach places.
  { id: 'cap-1', type: 'bottleCap', position: above(PADS[0], 0.06) },
  { id: 'cap-2', type: 'bottleCap', position: [GYM[0] - GYM_HALF, GYM_HEIGHT + 0.2, GYM[2] - GYM_HALF] },
  { id: 'cap-3', type: 'bottleCap', position: [PORTAL[0], 4.4, PORTAL[2] - 0.8] }, // on top of the portal arch
  { id: 'cap-4', type: 'bottleCap', position: above(LOOKOUT, 0.1) },
  // Seeds and millet, to carry to the feeder.
  { id: 'seed-1', type: 'seed', position: ground(105, 17, 0.05) },
  { id: 'seed-2', type: 'seed', position: ground(200, 18, 0.05) },
  { id: 'seed-3', type: 'seed', position: ground(265, 17, 0.05) },
  { id: 'seed-4', type: 'seed', position: above(PADS[1], 0.06) },
  { id: 'millet-1', type: 'millet', position: ground(160, 16, 0.05) },
  { id: 'millet-2', type: 'millet', position: ground(305, 18, 0.05) },
  { id: 'millet-3', type: 'millet', position: above(PADS[2], 0.06) },
  // Feathers.
  { id: 'feather-1', type: 'feather', position: [-0.3, NEST_Y + 0.05, 1.7] },
  { id: 'feather-2', type: 'feather', position: ground(20, 16, 0.05) },
  { id: 'feather-3', type: 'feather', position: ground(230, 11, 0.05) },
];

// --- The lobby's own parrots -------------------------------------------------

/** Places for the flock to perch: on every tree branch, and a few other spots. */
/** A little over half way out along a branch, on top of it. */
const onBranch = ({ a, b, radiusA, radiusB }: Limb): Vec3 => {
  const t = 0.55;
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t + (radiusA + radiusB) / 2 + 0.02,
    a[2] + (b[2] - a[2]) * t,
  ];
};

const flockSpots: Vec3[] = [
  ...TREES.flatMap((tree) => tree.branches.map(onBranch)),
  [GYM[0], GYM_HEIGHT + 0.13, GYM[2]], // middle of the gym's top beam
  // On a big branch of the home tree, just under the nest. The nest itself
  // is kept clear for the player and their pets.
  onBranch(HOME_LOW_BRANCHES[2]),
  [PORTAL[0] + 1.6, 0.4, PORTAL[2] + 0.6], // on the portal's step
  [LOOKOUT[0], LOOKOUT[1], LOOKOUT[2]],
  // On the grass.
  ground(10, 7, 0),
  ground(95, 10, 0),
  ground(170, 14, 0),
  ground(255, 8, 0),
  ground(280, 19, 0),
  ground(345, 12, 0),
];

/** Index of the first spot in a tree, to give each parrot a home. */
const treeSpot = (tree: number, branch: number): number =>
  TREES.slice(0, tree).reduce((n, t) => n + t.branches.length, 0) + branch;

const FLOCK: FlockDef = {
  spots: flockSpots,
  parrots: [
    { id: 'flock-budgie-1', characterId: 'budgie', home: treeSpot(0, 1), follows: true },
    { id: 'flock-budgie-2', characterId: 'skyBudgie', home: treeSpot(2, 0), mimics: true },
    { id: 'flock-budgie-3', characterId: 'budgie', home: treeSpot(5, 1) },
    { id: 'flock-cockatoo-1', characterId: 'cockatoo', home: treeSpot(1, 2), follows: true },
    { id: 'flock-cockatoo-2', characterId: 'cockatoo', home: treeSpot(4, 1), mimics: true },
    { id: 'flock-macaw-1', characterId: 'macaw', home: treeSpot(3, 3) },
    { id: 'flock-macaw-2', characterId: 'macaw', home: treeSpot(6, 2) },
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
  water: [{ id: 'bird-bath', position: POND, radius: POND_RADIUS }],
  characterPerches: CHARACTER_PERCHES,
  petCorner: PET_CORNER,
  flock: FLOCK,
};
