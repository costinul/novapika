import { gateLayout } from '../../gate/layout';
import { buildGate } from '../../gate/scenery';
import type { Vec3 } from '../../world/types';
import type { StaticBuilder } from '../build';
import type { Building, Facing } from '../town';
import { farAway, front, house, shell, shop, windows } from '../townScenery';
import type { Tree } from '../trees';
import {
  BELL_HOOKS,
  BELL_POSTS,
  BLOCKS,
  EDGE,
  EMPIRE,
  EMPIRE_ARM,
  FEEDER,
  GATE,
  HALF,
  HEIGHT,
  HOUSES,
  LIBERTY,
  ONE_TIMES_SQUARE,
  RED_STEPS,
  ROAD,
  SHOPS,
  SHORE,
  SQUARE,
  SQUARE_BUILDINGS,
  TAXIS,
  TOY_BOX,
  TREES,
  WATER_Y,
} from './layout';
import type { Taxi } from './layout';

// New York's fixed scenery, as coloured shapes with colliders. No textures
// and nothing from the browser, so tests can build the same city.

const GRASS = 0x8fd46a;
const PAVEMENT = 0xc4c0b8;
const PAVING = 0xd6d1c6;
const TARMAC = 0x5f6066;
const WATER = 0x3f8fc4;
const WATER_LIGHT = 0x6fb3de;
const LIMESTONE = 0xcfc6b4;
const LIMESTONE_DARK = 0xa9a08e;
const GLASS_DARK = 0x3d5266;
const WHITE = 0xf4f1e8;
const IRON = 0x25272b;
const GOLD = 0xe2b33c;
const RED = 0xd8352f;
const TAXI = 0xf7c531;
const COPPER = 0x6fbfa4; // the statue's green
const GRANITE = 0xcbbf9f;
const STONE = 0xb5b0a8;
const WOOD = 0xd9a05b;
const BARK = 0x9a6b3f;
const BARK_DARK = 0x7d5430;
const LEAF = [0x5dbb4a, 0x74c95a, 0x4aa63c, 0x8ad468];
const POST = 0x2b3a33;

const DOORS = [0x25272b, 0x2d5d8c, 0xa63a3a, 0x2f6b4f, 0xd8a330];
/** Bright colours for billboards. They show plain shapes only: no words and nobody's brand. */
const BRIGHT = [0xff3fa4, 0x2fd6e6, 0xffd23f, 0x8be04e, 0xff8a2a, 0x8a5cf6, 0xff4040, 0x35c98b];
const SIDES: readonly Facing[] = ['n', 's', 'e', 'w'];

function tree(b: StaticBuilder, t: Tree, leafShift: number): void {
  const { trunk } = t;
  b.limb(BARK, trunk.a, trunk.b, trunk.radiusA, trunk.radiusB, { sides: 8 });
  for (const branch of t.branches) b.limb(BARK_DARK, branch.a, branch.b, branch.radiusA, branch.radiusB, { sides: 6 });
  t.leaves.forEach((leaf, i) => b.blob(LEAF[(i + leafShift) % LEAF.length], leaf.center, leaf.radius, 0.75));
}

export function buildScenery(b: StaticBuilder): void {
  ground(b);
  for (const building of SHOPS) shop(b, building);
  HOUSES.forEach((building, i) => house(b, building, DOORS[i % DOORS.length]));
  // A city block stands alone, so it has windows on every side.
  BLOCKS.forEach((building, i) => {
    house(b, building, DOORS[i % DOORS.length]);
    for (const side of SIDES) if (side !== building.front) windows(b, { ...building, front: side }, 0.2);
  });
  timesSquare(b);
  empireState(b);
  liberty(b);
  TAXIS.forEach((cab) => taxi(b, cab));
  smallThings(b);
  TREES.forEach((t, i) => tree(b, t, i));
  buildGate(b, gateLayout(GATE, 'new-york'));
  // The far ground lies below the harbour, so that it does not hide it.
  farAway(b, WATER_Y - 0.6);
}

/**
 * The land is a solid sheet at height 0, and the bed of the harbour a little
 * lower. What is drawn on the land lies just below 0, so that nothing drawn
 * hides a small toy lying on the ground.
 */
function ground(b: StaticBuilder): void {
  const slab = (color: number, x: number, z: number, w: number, d: number, top: number): void =>
    b.box(color, [x, top - 0.75, z], [w, 1.5, d], { solid: false });
  const size = 2 * HALF;
  const land = SHORE + HALF;
  const landX = (SHORE - HALF) / 2;
  const sea = HALF - SHORE;
  const seaX = (SHORE + HALF) / 2;
  b.barrier([landX, -1, 0], [land, 2, size]);
  // The side of this slab is the harbour wall.
  slab(PAVEMENT, landX, 0, land, size, -0.05);
  b.barrier([seaX, WATER_Y - 0.5, 0], [sea, 1, size]);
  // The sea is drawn far out past the unseen wall, to the horizon.
  slab(WATER, SHORE + 150, 0, 300, 600, WATER_Y);
  for (const [x, z, r] of [[54, -50, 4], [62, -22, 5], [52, 34, 4.5], [64, 52, 5], [56, -6, 3.5], [100, 10, 9], [130, -60, 12]]) {
    b.disc(WATER_LIGHT, [x, WATER_Y + 0.004, z], r, 20);
  }

  // Grass: the park to the north-east, and the greens south of the square.
  slab(GRASS, 25, -47, 30, 32, -0.04);
  slab(GRASS, -18, 32, 20, 24, -0.04);
  slab(GRASS, 23, 24, 30, 14, -0.04);

  // The avenue from the gate to the north edge, and the street from the west edge to the harbour.
  slab(TARMAC, 0, 0, 2 * ROAD, 2 * EDGE, -0.03);
  slab(TARMAC, (SHORE - 6 - EDGE) / 2, 0, SHORE - 6 + EDGE, 2 * ROAD, -0.03);
  // Yellow lines down the middle of each.
  for (let z = -EDGE + 3; z < EDGE; z += 6) b.box(TAXI, [0, -0.028, z], [0.15, 0.01, 2.4], { solid: false });
  for (let x = -EDGE + 3; x < SHORE - 8; x += 6) b.box(TAXI, [x, -0.028, 0], [2.4, 0.01, 0.15], { solid: false });
  // Times Square is paved right across, and so are the walk along the harbour and the ground round the gate.
  slab(PAVING, (SQUARE.west + SQUARE.east) / 2, (SQUARE.north + SQUARE.south) / 2, SQUARE.east - SQUARE.west, SQUARE.south - SQUARE.north, -0.02);
  slab(PAVING, SHORE - 3, 0, 6, 2 * EDGE, -0.02);
  slab(PAVING, 0, (EDGE + HALF) / 2, 18, HALF - EDGE, -0.01);

  // The unseen walls and ceiling. The east wall stands in the harbour.
  const wall = 1;
  b.barrier([HALF + wall / 2, HEIGHT / 2 - 1, 0], [wall, HEIGHT + 2, size]);
  b.barrier([-HALF - wall / 2, HEIGHT / 2, 0], [wall, HEIGHT, size]);
  b.barrier([0, HEIGHT / 2 - 1, HALF + wall / 2], [size, HEIGHT + 2, wall]);
  b.barrier([0, HEIGHT / 2 - 1, -HALF - wall / 2], [size, HEIGHT + 2, wall]);
  b.barrier([0, HEIGHT + wall / 2, 0], [size, wall, size]);
  // A brick wall across the gap behind the gate. Drawn only: the unseen wall is just behind it.
  b.box(0x8a4b38, [0, 2.5, HALF - 0.06], [18, 5, 0.1], { solid: false });
  b.box(WHITE, [0, 5.1, HALF - 0.08], [18.2, 0.25, 0.14], { solid: false });
}

/**
 * A billboard on a building's front: a bright panel with a plain shape on
 * it. `sides` is how many sides the shape has: 3 for a triangle, many for a
 * disc.
 */
function billboard(
  b: StaticBuilder,
  building: Building,
  u: number,
  y: number,
  w: number,
  h: number,
  color: number,
  shape: number,
  sides: number,
): void {
  const { panel, point } = front(b, building);
  panel(IRON, u, y, w + 0.3, h + 0.3, 0.2);
  panel(color, u, y, w, h, 0.3);
  const radius = Math.min(w, h) * 0.32;
  b.limb(shape, point(u, y, 0.28), point(u, y, 0.36), radius, radius, { sides, solid: false });
}

/** Times Square: four tall buildings covered in billboards, the tower with the ball, and the red steps. */
function timesSquare(b: StaticBuilder): void {
  SQUARE_BUILDINGS.forEach((building, i) => {
    shell(b, building);
    const { width, panel } = front(b, building);
    // A dark shop front along the ground, then billboards to the roof, two to a row.
    panel(GLASS_DARK, 0, 1.9, width - 0.6, 3.4, 0.1);
    panel(BRIGHT[(i * 3 + 1) % BRIGHT.length], 0, 3.9, width, 0.5, 0.2);
    let row = 0;
    for (let y = 7; y + 2.5 <= building.h; y += 5.6, row++) {
      const wide = row % 2 === 0;
      const half = width / 2;
      if (wide) {
        billboard(b, building, 0, y, width - 1.2, 4.6, BRIGHT[(i * 2 + row) % BRIGHT.length], WHITE, 3 + ((i + row) % 4));
      } else {
        billboard(b, building, -half / 2, y, half - 1, 4.6, BRIGHT[(i + row * 3) % BRIGHT.length], WHITE, 24);
        billboard(b, building, half / 2, y, half - 1, 4.6, BRIGHT[(i + row * 3 + 4) % BRIGHT.length], IRON, 4);
      }
    }
    // The sides and backs are plain office walls.
    for (const side of SIDES) if (side !== building.front) windows(b, { ...building, front: side }, 0.2);
  });

  // The narrow tower: billboards one above another on the side toward the square, and the ball on its pole.
  const { x, z, side, top, ball } = ONE_TIMES_SQUARE;
  const tower: Building = { x, z, w: side, d: side, h: top, wall: 0x4a4f5c, front: 's' };
  b.box(tower.wall, [x, top / 2, z], [side, top, side]);
  for (let y = 3.6, row = 0; y + 2 <= top; y += 4.6, row++) {
    billboard(b, tower, 0, y, side - 1, 3.8, BRIGHT[(row * 3 + 2) % BRIGHT.length], row % 2 ? IRON : WHITE, row % 2 ? 24 : 5);
  }
  for (const other of SIDES) if (other !== 's') windows(b, { ...tower, front: other }, 0.2);
  b.limb(IRON, [x, top, z], [x, ball - 0.7, z], 0.07, 0.07, { sides: 5, solid: false });
  b.blob(WHITE, [x, ball, z], 0.9, 1, 1);
  b.blob(GOLD, [x, ball, z], 0.93, 0.5, 1);

  // The red steps: each one a solid block, a step higher and a step further north than the last.
  const { width, rise, run, count } = RED_STEPS;
  for (let i = 0; i < count; i++) {
    const height = (i + 1) * rise;
    b.box(RED, [RED_STEPS.x, height / 2, RED_STEPS.z - i * run], [width, height, run]);
  }
  // Traffic lights at the four corners of the crossing: a post, and a yellow box of lights.
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const [px, pz] = [sx * (ROAD + 0.6), sz * (ROAD + 0.6)];
    b.limb(POST, [px, 0, pz], [px, 4, pz], 0.08, 0.06, { sides: 6 });
    b.box(TAXI, [px, 3.5, pz], [0.36, 0.95, 0.36], { solid: false });
    for (const [k, light] of [0xff4040, 0xffd23f, 0x4fd66b].entries()) {
      b.box(light, [px - sx * 0.19, 3.8 - k * 0.3, pz], [0.03, 0.2, 0.2], { solid: false });
    }
  }
}

/** The Empire State Building: tiers that step in, each leaving a ledge, with dark strips of windows and a mast. */
function empireState(b: StaticBuilder): void {
  const { x, z, tiers, mast } = EMPIRE;
  let foot = 0;
  for (const { side, top } of tiers) {
    b.box(LIMESTONE, [x, (foot + top) / 2, z], [side, top - foot, side]);
    // Strips of windows up every face.
    const strips = Math.max(1, Math.round(side / 2.2));
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2;
      const d = side / 2 + 0.03;
      for (let k = 0; k < strips; k++) {
        const u = ((k + 0.5) / strips - 0.5) * side;
        b.box(k % 2 ? LIMESTONE_DARK : GLASS_DARK, [x + Math.sin(a) * d + Math.cos(a) * u, (foot + top) / 2, z + Math.cos(a) * d - Math.sin(a) * u], [
          0.7,
          top - foot - 0.8,
          0.06,
        ], { yaw: a, solid: false });
      }
    }
    foot = top;
  }
  b.limb(STONE, [x, foot, z], [x, mast, z], 0.35, 0.06, { sides: 6 });
  b.blob(RED, [x, mast, z], 0.16, 1, 0);
  // An arm near the top for a bell, over the last ledge.
  const hook = BELL_HOOKS['bell-empire'];
  b.limb(IRON, [x, EMPIRE_ARM, z], [hook[0] + 0.2, EMPIRE_ARM, z], 0.06, 0.06, { sides: 5 });
}

/** The Statue of Liberty: her island, a stone base, the pedestal, the statue in her robe, and the torch held up. */
function liberty(b: StaticBuilder): void {
  const { x, z, island, base, pedestal, robe, head, torch } = LIBERTY;
  b.drum(GRASS, [x, WATER_Y / 2 - 0.3, z], island, -WATER_Y + 0.6, 20);
  b.disc(0x7cc558, [x, 0.004, z], island - 0.6, 20);
  b.box(STONE, [x, base.top / 2, z], [base.side, base.top, base.side]);
  b.box(GRANITE, [x, (base.top + pedestal.top) / 2, z], [pedestal.side, pedestal.top - base.top, pedestal.side]);
  b.box(STONE, [x, pedestal.top - 0.15, z], [pedestal.side + 0.3, 0.3, pedestal.side + 0.3], { solid: false });

  // She faces the city, to the west. Her right arm, to the north, holds the torch up.
  b.limb(COPPER, [x, pedestal.top, z], [x, robe.top, z], robe.foot, robe.shoulder, { sides: 10 });
  b.blob(COPPER, [x, head, z], 0.75, 1.1, 1);
  // The crown: a band, and seven rays.
  b.drum(COPPER, [x, head + 0.55, z], 0.62, 0.22, 10);
  for (let k = 0; k < 7; k++) {
    const a = Math.PI / 2 + ((k - 3) * Math.PI) / 7;
    const ray = (r: number, up: number): Vec3 => [x - Math.sin(a) * r * 0.9, head + 0.6 + up, z + Math.cos(a) * r * 0.5 - 0];
    b.limb(COPPER, ray(0.5, 0), ray(1.25, 0.55), 0.08, 0.02, { sides: 4, solid: false });
  }
  // The arm with the torch, and its gold flame.
  b.limb(COPPER, [x, robe.top - 0.4, z - 0.7], [x - 0.2, torch - 1.2, z - 1.5], 0.3, 0.22, { sides: 6 });
  b.drum(COPPER, [x - 0.2, torch - 1.0, z - 1.5], 0.42, 0.3, 8);
  b.blob(GOLD, [x - 0.2, torch - 0.35, z - 1.5], 0.4, 1.5, 1);
  // The other arm holds the tablet against her side.
  b.limb(COPPER, [x, robe.top - 0.5, z + 0.7], [x - 0.7, robe.top - 2.4, z + 1.0], 0.28, 0.24, { sides: 6, solid: false });
  b.box(COPPER, [x - 0.95, robe.top - 2.2, z + 0.95], [0.25, 1.5, 0.95], { solid: false });
}

/** A yellow taxi: body, cab, wheels, and the light on its roof. */
function taxi(b: StaticBuilder, { x, z, alongX }: Taxi): void {
  /** A size given as length, height and width, turned to lie along the taxi. */
  const size = (length: number, height: number, width: number): Vec3 => (alongX ? [length, height, width] : [width, height, length]);
  const at = (along: number, y: number, across = 0): Vec3 => (alongX ? [x + along, y, z + across] : [x + across, y, z + along]);
  b.box(TAXI, at(0, 0.75), size(4.2, 0.9, 1.8));
  b.box(TAXI, at(-0.2, 1.5), size(2.4, 0.6, 1.7));
  b.box(GLASS_DARK, at(-0.2, 1.5), size(2.2, 0.42, 1.74), { solid: false });
  b.box(GLASS_DARK, at(-0.2, 1.5), size(2.44, 0.42, 1.5), { solid: false });
  // A band of black and white squares along each side.
  for (const side of [-1, 1]) {
    for (let k = -3; k <= 3; k++) {
      b.box(k % 2 ? IRON : WHITE, at(k * 0.5, 0.95, side * 0.91), size(0.5, 0.16, 0.02), { solid: false });
    }
  }
  b.box(WHITE, at(-0.2, 1.88), size(0.5, 0.16, 0.3), { solid: false });
  for (const along of [-1.4, 1.4]) {
    b.limb(0x151618, at(along, 0.35, -0.93), at(along, 0.35, 0.93), 0.35, 0.35, { sides: 10, solid: false });
  }
}

/** Bell posts, the bird table, the toy box's mat, fire hydrants and lamps along the harbour. */
function smallThings(b: StaticBuilder): void {
  // Each bell post: a post and an arm.
  for (const [id, [x, y, z]] of Object.entries(BELL_POSTS)) {
    const hook = BELL_HOOKS[id];
    b.limb(WOOD, [x, y, z], [x, hook[1] + 0.15, z], 0.07, 0.07, { sides: 6 });
    b.limb(WOOD, [x, hook[1] + 0.08, z], [hook[0] + 0.15, hook[1] + 0.08, z], 0.05, 0.05, { sides: 5 });
  }
  // A flat-topped stone for the bird table's tray, and a mat under the toy box.
  b.drum(STONE, [FEEDER[0], FEEDER[1] / 2, FEEDER[2]], 0.5, FEEDER[1], 9);
  b.disc(0xffe08a, [TOY_BOX[0], 0.004, TOY_BOX[2]], 2.2, 20);
  // Red fire hydrants on the corners of the square.
  for (const [hx, hz] of [[SQUARE.east - 1, SQUARE.south - 1], [SQUARE.west + 1, SQUARE.south - 1], [SQUARE.east - 1, -6], [SQUARE.west + 1, -6]]) {
    b.drum(RED, [hx, 0.35, hz], 0.16, 0.7, 8);
    b.blob(RED, [hx, 0.75, hz], 0.17, 0.8, 0);
  }
  // Lamps along the walk by the harbour.
  for (let z = -54; z <= 54; z += 18) {
    b.limb(POST, [SHORE - 0.8, 0, z], [SHORE - 0.8, 3.4, z], 0.09, 0.06, { sides: 6 });
    b.blob(0xfff2c0, [SHORE - 0.8, 3.6, z], 0.26, 1, 0);
  }
}
