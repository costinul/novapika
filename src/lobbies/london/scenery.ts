import { gateLayout } from '../../gate/layout';
import { buildGate } from '../../gate/scenery';
import type { Vec3 } from '../../world/types';
import type { StaticBuilder } from '../build';
import { ROOF } from '../town';
import { farAway, front, house, shell, shop, windows } from '../townScenery';
import type { Tree } from '../trees';
import {
  BELL_HOOKS,
  BIG_BEN,
  BLOCKS,
  BUS,
  CAB,
  CAPSULES,
  DECK_HALF,
  EDGE,
  EYE,
  FEEDER,
  GATE,
  GATE_BELL_POST,
  HALF,
  HEIGHT,
  HOUSES,
  PARK_BELL_POST,
  PARLIAMENT,
  PHONE_BOX,
  PILLAR_BOX,
  RIVER,
  ROADS,
  SHOPS,
  TOWER_BRIDGE,
  TOY_BOX,
  TREES,
  VICTORIA_TOWER,
  WALKWAY_HALF,
  WATER_Y,
  WESTMINSTER_BRIDGE,
} from './layout';
import type { Stage } from './layout';

// London's fixed scenery, as coloured shapes with colliders. No textures and
// nothing from the browser, so tests can build the same city.

const GRASS = 0x8fd46a;
const PAVEMENT = 0xcfc8ba;
const PAVING = 0xdcd5c4;
const TARMAC = 0x6f6f75;
const WATER = 0x4f9fd0;
const WATER_LIGHT = 0x7fbfe6;
const HONEY = 0xd9bd82;
const HONEY_DARK = 0xbf9f63;
const SLATE = 0x3d4651;
const GLASS_DARK = 0x3d5266;
const GLASS = 0xbfe3f5;
const WHITE = 0xf4f1e8;
const IRON = 0x25272b;
const GOLD = 0xe2b33c;
const RED = 0xc8302b;
const BRIDGE_GREEN = 0x6fa58a;
const BRIDGE_BLUE = 0x5aa7d6;
const BRIDGE_STONE = 0xcdbb98;
const STONE = 0xb5b0a8;
const WOOD = 0xd9a05b;
const BARK = 0x9a6b3f;
const BARK_DARK = 0x7d5430;
const LEAF = [0x5dbb4a, 0x74c95a, 0x4aa63c, 0x8ad468];
const POST = 0x2b3a33;

const DOORS = [0x25272b, 0x2d5d8c, 0xa63a3a, 0x2f6b4f, 0xd8a330];

/** Square stages of a tower, one on top of the other from `from` up, each solid. */
function stages(b: StaticBuilder, x: number, z: number, from: number, list: readonly Stage[], colors: readonly number[]): void {
  let foot = from;
  list.forEach(({ side, top }, i) => {
    b.box(colors[Math.min(i, colors.length - 1)], [x, (foot + top) / 2, z], [side, top - foot, side]);
    foot = top;
  });
}

function tree(b: StaticBuilder, t: Tree, leafShift: number): void {
  const { trunk } = t;
  b.limb(BARK, trunk.a, trunk.b, trunk.radiusA, trunk.radiusB, { sides: 8 });
  for (const branch of t.branches) b.limb(BARK_DARK, branch.a, branch.b, branch.radiusA, branch.radiusB, { sides: 6 });
  t.leaves.forEach((leaf, i) => b.blob(LEAF[(i + leafShift) % LEAF.length], leaf.center, leaf.radius, 0.75));
}

export function buildScenery(b: StaticBuilder): void {
  ground(b);
  for (const building of SHOPS) shop(b, building);
  [...HOUSES, ...BLOCKS].forEach((building, i) => house(b, building, DOORS[i % DOORS.length]));
  bigBen(b);
  parliament(b);
  westminsterBridge(b);
  bus(b);
  towerBridge(b);
  eye(b);
  smallThings(b);
  TREES.forEach((t, i) => tree(b, t, i));
  buildGate(b, gateLayout(GATE, 'london'));
  // The far ground lies below the river, so that it does not hide it.
  farAway(b, WATER_Y - 0.6);
}

/**
 * The two banks are solid sheets at height 0, and the bed of the Thames a
 * little lower. What is drawn on the banks lies just below 0, so that
 * nothing drawn hides a small toy lying on the ground.
 */
function ground(b: StaticBuilder): void {
  const slab = (color: number, x: number, z: number, w: number, d: number, top: number): void =>
    b.box(color, [x, top - 0.75, z], [w, 1.5, d], { solid: false });
  const size = 2 * HALF;
  const bank = HALF - RIVER;
  const bankZ = (HALF + RIVER) / 2;
  for (const side of [-1, 1]) {
    b.barrier([0, -1, side * bankZ], [size, 2, bank]);
    // The side of this slab is the river wall.
    slab(PAVEMENT, 0, side * bankZ, size, bank, -0.05);
  }
  b.barrier([0, WATER_Y - 0.5, 0], [size, 1, 2 * RIVER]);
  slab(WATER, 0, 0, size, 2 * RIVER, WATER_Y);
  for (const [x, z, r] of [[-56, 3, 4], [-30, -4, 5], [-6, 2, 4.5], [20, -3, 5], [52, 4, 4.5], [8, 5, 3]]) {
    b.disc(WATER_LIGHT, [x, WATER_Y + 0.004, z], r, 20);
  }

  // Grass: the park, the greens on both banks, and a lawn behind Parliament.
  slab(GRASS, 17, -50, 34, 24, -0.04);
  slab(GRASS, 23, -19, 22, 16, -0.04);
  slab(GRASS, -19, -26.2, 30, 4, -0.04);
  slab(GRASS, 25, 28.5, 38, 23, -0.04);
  slab(GRASS, -23, 33, 38, 14, -0.04);
  slab(GRASS, -57, 25, 14, 30, -0.04);

  // The two roads, the ways from them to the bridges, and the street up from the gate.
  const road = 2 * ROADS.half;
  slab(TARMAC, 0, ROADS.north, 2 * EDGE, road, -0.03);
  slab(TARMAC, 0, ROADS.south, 2 * EDGE, road, -0.03);
  for (const x of [WESTMINSTER_BRIDGE.x, TOWER_BRIDGE.x]) {
    const north = ROADS.north + ROADS.half;
    const south = ROADS.south - ROADS.half;
    slab(TARMAC, x, (north - RIVER) / 2, 6, -RIVER - north, -0.03);
    slab(TARMAC, x, (south + RIVER) / 2, 6, south - RIVER, -0.03);
  }
  const gateStreet = ROADS.south + ROADS.half;
  slab(TARMAC, 0, (gateStreet + EDGE) / 2, road, EDGE - gateStreet, -0.03);
  // A path from the south road to the river, and paving round the gate.
  slab(PAVING, 0, (RIVER + ROADS.south - ROADS.half) / 2, 5, ROADS.south - ROADS.half - RIVER, -0.02);
  slab(PAVING, 0, (EDGE + HALF) / 2, 18, HALF - EDGE, -0.01);

  // The unseen walls behind the houses, and the unseen ceiling.
  const wall = 1;
  b.barrier([HALF + wall / 2, HEIGHT / 2 - 1, 0], [wall, HEIGHT + 2, size]);
  b.barrier([-HALF - wall / 2, HEIGHT / 2 - 1, 0], [wall, HEIGHT + 2, size]);
  b.barrier([0, HEIGHT / 2, HALF + wall / 2], [size, HEIGHT, wall]);
  b.barrier([0, HEIGHT / 2, -HALF - wall / 2], [size, HEIGHT, wall]);
  b.barrier([0, HEIGHT + wall / 2, 0], [size, wall, size]);
  // A brick wall across the gap behind the gate. Drawn only: the unseen wall is just behind it.
  b.box(0xc9a86a, [0, 2.5, HALF - 0.06], [18, 5, 0.1], { solid: false });
  b.box(WHITE, [0, 5.1, HALF - 0.08], [18.2, 0.25, 0.14], { solid: false });
}

/** Big Ben: a square shaft, a clock with four faces, the open belfry and a roof that steps up to a point. */
function bigBen(b: StaticBuilder): void {
  const { x, z, shaft, clock, belfry, roof, finial } = BIG_BEN;
  b.box(HONEY, [x, shaft.top / 2, z], [shaft.side, shaft.top, shaft.side]);
  b.box(HONEY, [x, (shaft.top + clock.top) / 2, z], [clock.side, clock.top - shaft.top, clock.side]);

  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    const [nx, nz] = [Math.sin(a), Math.cos(a)];
    const [rx, rz] = [Math.cos(a), -Math.sin(a)];
    // Ribs up the shaft, and narrow windows between them.
    for (const u of [-1.6, 0, 1.6]) {
      const d = shaft.side / 2 + 0.03;
      b.box(HONEY_DARK, [x + nx * d + rx * u, shaft.top / 2, z + nz * d + rz * u], [0.4, shaft.top - 1, 0.06], { yaw: a, solid: false });
    }
    for (const u of [-0.8, 0.8]) {
      for (let y = 5; y < shaft.top - 2; y += 6) {
        const d = shaft.side / 2 + 0.02;
        b.box(GLASS_DARK, [x + nx * d + rx * u, y, z + nz * d + rz * u], [0.4, 1.8, 0.04], { yaw: a, solid: false });
      }
    }
    // A clock face: a gold rim, a white face and black hands, at three o'clock.
    const d = clock.side / 2;
    const middle = (shaft.top + clock.top) / 2;
    const out = (by: number, u = 0, y = 0): Vec3 => [x + nx * (d + by) + rx * u, middle + y, z + nz * (d + by) + rz * u];
    b.limb(GOLD, out(-0.02), out(0.05), clock.face + 0.3, clock.face + 0.3, { sides: 24, solid: false });
    b.limb(WHITE, out(0), out(0.09), clock.face, clock.face, { sides: 24, solid: false });
    b.box(IRON, out(0.11, 0, 0.95), [0.18, 1.9, 0.05], { yaw: a, solid: false });
    b.box(IRON, out(0.11, 0.65, 0), [1.3, 0.22, 0.05], { yaw: a, solid: false });
    b.limb(GOLD, out(0.1), out(0.16), 0.22, 0.22, { sides: 8, solid: false });
  }

  // The belfry: a post at each corner, open between them. The great bell hangs in the middle.
  const corner = belfry.side / 2 - belfry.post / 2;
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    b.box(HONEY, [x + sx * corner, (clock.top + belfry.top) / 2, z + sz * corner], [belfry.post, belfry.top - clock.top, belfry.post]);
  }
  // The roof: the slab over the belfry, three dark steps, the lantern, and two more steps to the point.
  stages(b, x, z, belfry.top, roof, [HONEY, SLATE, SLATE, SLATE, 0xe8d9a0, SLATE, SLATE]);
  const point = roof[roof.length - 1].top;
  b.limb(GOLD, [x, point, z], [x, finial, z], 0.08, 0.03, { sides: 5, solid: false });
  b.blob(GOLD, [x, finial, z], 0.2, 1, 0);
}

/** The Houses of Parliament: a long hall with turrets along its roof, and the Victoria Tower at its far end. */
function parliament(b: StaticBuilder): void {
  shell(b, PARLIAMENT);
  windows(b, PARLIAMENT, 0.2);
  const { panel, width } = front(b, PARLIAMENT);
  for (let u = -width / 2 + 0.3; u <= width / 2; u += 3.08) panel(HONEY_DARK, u, PARLIAMENT.h / 2, 0.35, PARLIAMENT.h - 0.4, 0.12);
  // Little turrets along the front of the roof.
  const roof = PARLIAMENT.h + ROOF;
  const edge = PARLIAMENT.z + PARLIAMENT.d / 2 - 0.35;
  for (let k = 0; k <= 10; k++) {
    const tx = PARLIAMENT.x - PARLIAMENT.w / 2 + 0.6 + (k * (PARLIAMENT.w - 1.2)) / 10;
    b.box(HONEY, [tx, roof + 0.65, edge], [0.5, 1.3, 0.5]);
  }

  const { x, z, side, top, turret, flag } = VICTORIA_TOWER;
  b.box(HONEY, [x, top / 2, z], [side, top, side]);
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    b.box(HONEY_DARK, [x + sx * (side / 2 - 0.3), turret / 2, z + sz * (side / 2 - 0.3)], [1.2, turret, 1.2]);
  }
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    const d = side / 2 + 0.02;
    for (const y of [5, 11, 17]) {
      b.box(GLASS_DARK, [x + Math.sin(a) * d, y, z + Math.cos(a) * d], [1.6, 3.2, 0.04], { yaw: a, solid: false });
    }
  }
  // The flag: blue, with a white cross and a red one over it.
  b.limb(WHITE, [x, top, z], [x, flag, z], 0.07, 0.05, { sides: 5, solid: false });
  b.box(0x2a4b9b, [x + 1.0, flag - 0.65, z], [1.9, 1.2, 0.03], { solid: false });
  b.box(WHITE, [x + 1.0, flag - 0.65, z], [1.92, 0.36, 0.05], { solid: false });
  b.box(WHITE, [x + 1.0, flag - 0.65, z], [0.36, 1.22, 0.05], { solid: false });
  b.box(RED, [x + 1.0, flag - 0.65, z], [1.94, 0.16, 0.07], { solid: false });
  b.box(RED, [x + 1.0, flag - 0.65, z], [0.16, 1.24, 0.07], { solid: false });
}

/** A bridge's deck, level with the banks, on stone piers. */
function deck(b: StaticBuilder, x: number, half: number): void {
  b.box(TARMAC, [x, -0.25, 0], [2 * half, 0.5, 2 * DECK_HALF]);
  for (const z of [-5, 0, 5]) b.box(STONE, [x, (WATER_Y - 0.5) / 2, z], [2 * half + 0.4, -WATER_Y + 0.5, 1.2], { solid: false });
}

/** Westminster Bridge: low and green, with lamps along it. */
function westminsterBridge(b: StaticBuilder): void {
  const { x, half } = WESTMINSTER_BRIDGE;
  deck(b, x, half);
  for (const side of [-1, 1]) {
    b.box(BRIDGE_GREEN, [x + side * (half - 0.1), 0.4, 0], [0.2, 0.8, 2 * DECK_HALF]);
    b.box(BRIDGE_GREEN, [x + side * (half + 0.03), -0.45, 0], [0.06, 0.9, 2 * DECK_HALF], { solid: false });
    for (const z of [-6, 6]) {
      b.limb(POST, [x + side * (half - 0.1), 0.8, z], [x + side * (half - 0.1), 3.2, z], 0.07, 0.05, { sides: 5 });
      b.blob(0xfff2c0, [x + side * (half - 0.1), 3.4, z], 0.24, 1, 0);
    }
  }
}

/** The red bus: two decks of windows, and a flat roof to land on. */
function bus(b: StaticBuilder): void {
  const { x, z, w, h, l } = BUS;
  const floor = 0.45;
  b.box(RED, [x, (floor + h) / 2, z], [w, h - floor, l]);
  for (const wz of [-l / 2 + 1.5, l / 2 - 1.5]) {
    b.limb(IRON, [x - w / 2 - 0.04, 0.5, z + wz], [x + w / 2 + 0.04, 0.5, z + wz], 0.5, 0.5, { sides: 12 });
  }
  for (const side of [-1, 1]) {
    const sx = x + side * (w / 2 + 0.02);
    b.box(GLASS_DARK, [sx, 1.75, z], [0.04, 0.9, l - 1.2], { solid: false });
    b.box(GLASS_DARK, [sx, 3.5, z], [0.04, 0.85, l - 0.8], { solid: false });
    b.box(0xf2e6c8, [sx, 2.6, z], [0.05, 0.22, l], { solid: false });
  }
  // The front, toward the north bank: two windows and the board that says where it is going.
  const nose = z - l / 2 - 0.02;
  b.box(GLASS_DARK, [x, 1.75, nose], [w - 0.5, 0.9, 0.04], { solid: false });
  b.box(GLASS_DARK, [x, 3.5, nose], [w - 0.5, 0.85, 0.04], { solid: false });
  b.box(0xf4e04d, [x, 2.6, nose], [1.4, 0.3, 0.05], { solid: false });
}

/** Tower Bridge: two stone towers with the road through them, blue walkways between, and blue chains to the banks. */
function towerBridge(b: StaticBuilder): void {
  const { x, half, towerZ, tower, arch, top, roof, finial, walkway } = TOWER_BRIDGE;
  deck(b, x, half);
  for (const side of [-1, 1]) {
    b.box(BRIDGE_BLUE, [x + side * (half - 0.1), 0.45, 0], [0.2, 0.9, 2 * DECK_HALF]);
    b.box(WHITE, [x + side * (half - 0.1), 0.93, 0], [0.26, 0.08, 2 * DECK_HALF], { solid: false });
  }

  for (const end of [-1, 1]) {
    const z = end * towerZ;
    // Two legs standing in the river, with the road between them, and the tower's body above.
    const leg = tower.w / 2 - arch.half;
    for (const side of [-1, 1]) {
      b.box(BRIDGE_STONE, [x + side * (arch.half + leg / 2), (WATER_Y + arch.top) / 2, z], [leg, arch.top - WATER_Y, tower.d]);
    }
    b.box(BRIDGE_STONE, [x, (arch.top + top) / 2, z], [tower.w, top - arch.top, tower.d]);
    // A turret at each corner, and windows on the faces along the road.
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      b.box(0xb8a47e, [x + sx * (tower.w / 2 - 0.3), (arch.top + top + 1.5) / 2, z + sz * (tower.d / 2 - 0.3)], [0.9, top + 1.5 - arch.top, 0.9]);
    }
    for (const face of [-1, 1]) {
      for (const y of [5.5, 8.5, 12]) {
        b.box(GLASS_DARK, [x, y, z + face * (tower.d / 2 + 0.02)], [1.4, 1.7, 0.04], { solid: false });
      }
    }
    stages(b, x, z, top, roof, [0x4b5a6b]);
    b.limb(GOLD, [x, roof[roof.length - 1].top, z], [x, finial, z], 0.07, 0.03, { sides: 5, solid: false });

    // The chains: from the tower's shoulders down to a pier on the bank.
    const foot = end * (DECK_HALF + 2.5);
    for (const side of [-1, 1]) {
      const cx = x + side * (half + 0.1);
      b.limb(BRIDGE_BLUE, [cx, top - 1, end * (towerZ + tower.d / 2)], [cx, 2, foot], 0.16, 0.16, { sides: 6 });
      b.box(BRIDGE_STONE, [cx, 1.1, foot], [0.9, 2.2, 0.9]);
    }
  }
  // The two walkways, high up between the towers.
  for (const side of [-1, 1]) {
    const wx = x + side * walkway.aside;
    b.box(BRIDGE_BLUE, [wx, (walkway.bottom + walkway.top) / 2, 0], [walkway.w, walkway.top - walkway.bottom, 2 * WALKWAY_HALF + 0.2]);
    b.box(WHITE, [wx + side * (walkway.w / 2 + 0.02), (walkway.bottom + walkway.top) / 2, 0], [0.04, 0.3, 2 * WALKWAY_HALF], { solid: false });
  }
}

/** The London Eye: the rim, its spokes and hub, the capsules, two legs and the place to get on. */
function eye(b: StaticBuilder): void {
  const { x, z, hub, radius, capsule, feet } = EYE;
  const segments = 32;
  const rim = (k: number): Vec3 => {
    const a = (k / segments) * Math.PI * 2;
    return [x + Math.sin(a) * radius, hub + Math.cos(a) * radius, z];
  };
  for (let k = 0; k < segments; k++) {
    b.limb(WHITE, rim(k), rim(k + 1), 0.22, 0.22, { sides: 5 });
    if (k % 2 === 0) b.limb(0xdfe6ea, [x, hub, z], rim(k), 0.05, 0.05, { sides: 4, solid: false });
  }
  b.limb(WHITE, [x, hub, z - 1.2], [x, hub, z + 1.2], 1, 1, { sides: 12 });
  for (const at of CAPSULES) {
    b.box(GLASS, at, [capsule.w, capsule.h, capsule.d]);
    b.box(WHITE, at, [capsule.w + 0.06, 0.16, capsule.d + 0.06], { solid: false });
  }
  // The legs lean back from the hub, and two thin cables run further back. The cables are drawn only.
  for (const side of [-1, 1]) {
    b.limb(WHITE, [x, hub, z + 1.2], [x + side * feet.aside, 0, z + feet.behind], 0.45, 0.45, { sides: 8 });
    b.limb(0xdfe6ea, [x, hub, z + 1.2], [x + side * 3, 0, z + feet.behind + 4], 0.05, 0.05, { sides: 4, solid: false });
  }
  b.box(0x5c6370, [x, 0.3, z], [12, 0.6, 5]);
}

/** The cab, the red boxes, the bell posts, the bird table, the toy box's mat and the lamps along the riverside walk. */
function smallThings(b: StaticBuilder): void {
  // A black cab, pointing along the road.
  {
    const [x, , z] = CAB;
    b.box(IRON, [x, 0.75, z], [4.2, 0.9, 1.8]);
    b.box(IRON, [x - 0.2, 1.5, z], [2.4, 0.6, 1.7]);
    b.box(GLASS_DARK, [x - 0.2, 1.5, z], [2.2, 0.42, 1.74], { solid: false });
    b.box(0xf2a03d, [x - 0.2, 1.87, z], [0.5, 0.14, 0.3], { solid: false });
    for (const wx of [-1.4, 1.4]) {
      b.limb(0x151618, [x + wx, 0.35, z - 0.93], [x + wx, 0.35, z + 0.93], 0.35, 0.35, { sides: 10, solid: false });
    }
  }
  {
    const [x, , z] = PHONE_BOX;
    b.box(RED, [x, 1.25, z], [1, 2.5, 1]);
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2;
      b.box(GLASS_DARK, [x + Math.sin(a) * 0.51, 1.4, z + Math.cos(a) * 0.51], [0.7, 1.6, 0.02], { yaw: a, solid: false });
    }
  }
  {
    const [x, , z] = PILLAR_BOX;
    b.drum(RED, [x, 0.7, z], 0.32, 1.4, 10);
    b.drum(IRON, [x, 1.44, z], 0.36, 0.08, 10);
  }
  // Two bell posts: a post and an arm.
  for (const [post, id] of [[GATE_BELL_POST, 'bell-gate'], [PARK_BELL_POST, 'bell-park']] as const) {
    const [x, , z] = post;
    const hook = BELL_HOOKS[id];
    b.limb(WOOD, [x, 0, z], [x, hook[1] + 0.15, z], 0.07, 0.07, { sides: 6 });
    b.limb(WOOD, [x, hook[1] + 0.08, z], [hook[0] + 0.15, hook[1] + 0.08, z], 0.05, 0.05, { sides: 5 });
  }
  // A flat-topped stone for the bird table's tray, and a mat under the toy box.
  b.drum(STONE, [FEEDER[0], FEEDER[1] / 2, FEEDER[2]], 0.5, FEEDER[1], 9);
  b.disc(0xffe08a, [TOY_BOX[0], 0.004, TOY_BOX[2]], 2.2, 20);
  // Lamps along the riverside walk, on both banks.
  for (const side of [-1, 1]) {
    for (const x of [-36, -12, 12, 28, 48]) {
      if (side < 0 && x < 4) continue; // Parliament stands on the bank there.
      const z = side * (RIVER + 1);
      b.limb(POST, [x, 0, z], [x, 3.4, z], 0.09, 0.06, { sides: 6 });
      b.blob(0xfff2c0, [x, 3.6, z], 0.26, 1, 0);
    }
  }
}
