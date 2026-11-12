import { gateLayout } from '../../gate/layout';
import { buildGate } from '../../gate/scenery';
import type { Vec3 } from '../../world/types';
import type { StaticBuilder } from '../build';
import type { Tree } from '../trees';
import {
  BELL_HOOKS,
  BELL_LAMP,
  CONTENT,
  EDGE,
  FEEDER,
  GATE,
  GATE_BELL_POST,
  HALF,
  HEIGHT,
  HOUSES,
  LAMP_HEIGHT,
  LAMPS,
  PLAZA,
  POND,
  POND_RADIUS,
  RING,
  ROAD,
  ROOF,
  SHOPS,
  SIGN,
  STALL,
  STALLS,
  STREET,
  TOWER,
  TOWER_ARM,
  TOWN_HALL,
  TOY_BOX,
  TREES,
  onStall,
} from './layout';
import type { Building, Facing } from './layout';

// Downham Market's fixed scenery, as coloured shapes with colliders. No
// textures and nothing from the browser, so tests can build the same town.

const GRASS = 0x8fd46a;
const GRASS_DARK = 0x7cc558;
const PAVING = 0xd9cfb8; // the market place
const PAVEMENT = 0xc4bcae;
const TARMAC = 0x6f6f75;
const SLATE = 0x5c6370;
const GLASS = 0x9cc4dd;
const GLASS_DARK = 0x3d5266;
const WHITE = 0xf4f1e8;
const IRON = 0x25272b; // the tower's black
const GOLD = 0xe2b33c;
const CARR = 0x9c5a2c;
const BRICK = 0xb55a3c;
const STONE = 0xb5b0a8;
const WOOD = 0xd9a05b;
const BARK = 0x9a6b3f;
const BARK_DARK = 0x7d5430;
const LEAF = [0x5dbb4a, 0x74c95a, 0x4aa63c, 0x8ad468];
const WATER = 0x5cc8f0;
const POST = 0x2b3a33; // lamp posts and the like

/** For each way a front can face: the turn that faces it, and a step straight out of it. */
const OUT: Record<Facing, { yaw: number; x: number; z: number }> = {
  s: { yaw: 0, x: 0, z: 1 },
  n: { yaw: Math.PI, x: 0, z: -1 },
  e: { yaw: Math.PI / 2, x: 1, z: 0 },
  w: { yaw: -Math.PI / 2, x: -1, z: 0 },
};

/** How to put flat things on a building's front. */
function front(b: StaticBuilder, building: Building) {
  const out = OUT[building.front];
  const acrossX = building.front === 'e' || building.front === 'w';
  const width = acrossX ? building.d : building.w;
  const depth = acrossX ? building.w : building.d;
  // A step to the right along the front, as seen by somebody facing it.
  const rx = Math.cos(out.yaw);
  const rz = -Math.sin(out.yaw);
  return {
    width,
    /** A flat panel on the front: `u` to the right of its middle, `y` the height of its middle, standing `proud` of the wall. */
    panel(color: number, u: number, y: number, w: number, h: number, proud = 0.04): void {
      const d = depth / 2 + proud / 2;
      b.box(color, [building.x + out.x * d + rx * u, y, building.z + out.z * d + rz * u], [w, h, proud], {
        yaw: out.yaw,
        solid: false,
      });
    },
  };
}

/** Rows of windows on a front, from `from` up, with a sill under each. */
function windows(b: StaticBuilder, building: Building, from: number): void {
  const { width, panel } = front(b, building);
  const columns = Math.max(1, Math.round(width / 3.2));
  const floors = Math.floor((building.h - from - 0.4) / 2.6);
  for (let floor = 0; floor < floors; floor++) {
    const y = from + 1.3 + floor * 2.6;
    for (let column = 0; column < columns; column++) {
      const u = ((column + 0.5) / columns - 0.5) * width;
      panel(GLASS, u, y, 1.0, 1.4);
      panel(WHITE, u, y - 0.78, 1.2, 0.12, 0.1);
    }
  }
}

/** The walls and flat roof of a building, solid, with a chimney on some. */
function shell(b: StaticBuilder, building: Building): void {
  const { x, z, w, d, h, wall } = building;
  b.box(wall, [x, h / 2, z], [w, h, d]);
  b.box(SLATE, [x, h + ROOF / 2, z], [w + 0.3, ROOF, d + 0.3]);
  if (building.chimney) b.box(BRICK, [x + w / 4, h + ROOF + 0.6, z], [0.7, 1.2, 0.7]);
}

/** A shop: a painted front with a big window and a door, and windows above. */
function shop(b: StaticBuilder, building: Building): void {
  shell(b, building);
  const { width, panel } = front(b, building);
  const paint = building.shop ?? WHITE;
  panel(paint, 0, 1.6, width - 0.4, 3.2, 0.08);
  panel(GLASS_DARK, -0.7, 1.5, width - 2.6, 1.7, 0.12);
  panel(GLASS_DARK, width / 2 - 1.0, 1.15, 0.9, 2.1, 0.12);
  panel(WHITE, 0, 2.85, width - 0.8, 0.5, 0.14);
  windows(b, building, 3.2);
}

/** A plain house: a door, and windows on every floor. */
function house(b: StaticBuilder, building: Building, door: number): void {
  shell(b, building);
  const { width, panel } = front(b, building);
  panel(door, -width / 2 + 1.2, 1.05, 0.9, 2.1, 0.08);
  windows(b, building, 0.2);
}

const DOORS = [0x2f6b4f, 0x2d5d8c, 0xa63a3a, 0x3a3a44, 0xd8a330];

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
  townHall(b);
  clockTower(b);
  market(b);
  ringPoles(b);
  greens(b);
  buildGate(b, gateLayout(GATE, 'downham-market'));
  farAway(b);
}

/**
 * The ground is one solid sheet at height 0. What is drawn on it lies a
 * little lower, the market place highest, so that nothing drawn hides a
 * small toy lying on the ground.
 */
function ground(b: StaticBuilder): void {
  const slab = (color: number, x: number, z: number, w: number, d: number, top: number): void =>
    b.box(color, [x, top - 0.5, z], [w, 1, d], { solid: false });
  const size = 2 * HALF;
  b.barrier([0, -0.5, 0], [size, 1, size]);
  slab(GRASS, 0, 0, size, size, -0.04);
  for (const [x, z, r] of [[-36, -22, 4], [34, 22, 3.5], [-30, 22, 3], [22, -36, 3.5], [36, -12, 3]]) {
    b.disc(GRASS_DARK, [x, -0.035, z], r);
  }
  // Pavements, with the roadways laid over them, out from the market place to the houses.
  const from = PLAZA;
  const length = EDGE - from;
  const middle = (EDGE + from) / 2;
  for (const side of [-1, 1]) {
    slab(PAVEMENT, 0, side * middle, 2 * STREET, length, -0.03);
    slab(PAVEMENT, side * middle, 0, length, 2 * STREET, -0.03);
    slab(TARMAC, 0, side * middle, 2 * ROAD, length, -0.02);
    slab(TARMAC, side * middle, 0, length, 2 * ROAD, -0.02);
  }
  // A strip of pavement in front of the houses, all the way round, and paving round the gate.
  for (const side of [-1, 1]) {
    slab(PAVEMENT, 0, side * (EDGE - 0.75), 2 * EDGE, 1.5, -0.03);
    slab(PAVEMENT, side * (EDGE - 0.75), 0, 1.5, 2 * EDGE, -0.03);
  }
  slab(PAVING, 0, (EDGE + HALF) / 2, 18, HALF - EDGE, -0.01);
  slab(PAVING, 0, 0, 2 * PLAZA, 2 * PLAZA, 0);
  // A ring of darker paving round the tower.
  b.disc(0xc9bfa6, [0, 0.004, 0], 5, 32);

  // The unseen walls behind the houses, and the unseen ceiling.
  const wall = 1;
  b.barrier([HALF + wall / 2, HEIGHT / 2, 0], [wall, HEIGHT, size]);
  b.barrier([-HALF - wall / 2, HEIGHT / 2, 0], [wall, HEIGHT, size]);
  b.barrier([0, HEIGHT / 2, HALF + wall / 2], [size, HEIGHT, wall]);
  b.barrier([0, HEIGHT / 2, -HALF - wall / 2], [size, HEIGHT, wall]);
  b.barrier([0, HEIGHT + wall / 2, 0], [size, wall, size]);
  // A garden wall across the gap behind the gate. Drawn only: the unseen wall is just behind it.
  b.box(CARR, [0, 2.5, HALF - 0.06], [18, 5, 0.1], { solid: false });
  b.box(WHITE, [0, 5.1, HALF - 0.08], [18.2, 0.25, 0.14], { solid: false });
}

/** White brick with brown carrstone panels, and a front that rises to a cupola with a weather vane. */
function townHall(b: StaticBuilder): void {
  const { body, bay, cupola } = TOWN_HALL;
  shell(b, { ...body, chimney: false });
  const { width, panel } = front(b, body);

  // Carrstone panels between tall windows, either side of the door.
  for (const side of [-1, 1]) {
    for (const [u, w] of [[2.6, 1.3], [4.9, 1.3]] as const) {
      panel(GLASS, side * u, 2.4, w, 2.8, 0.1);
      panel(GLASS, side * u, 6.4, w, 2.2, 0.1);
    }
    panel(CARR, side * 3.75, 2.4, 0.8, 2.8);
    panel(CARR, side * 3.75, 6.4, 0.8, 2.2);
    panel(CARR, side * 6.05, 4.5, 0.6, 8);
  }
  panel(WHITE, 0, 4.6, width, 0.3, 0.14);
  panel(WHITE, 0, 8.8, width, 0.4, 0.16);

  // The middle of the front: the door, a tall window over it, and carrstone to the top.
  panel(0x2f5d4a, 0, 1.4, 1.8, 2.8, 0.14);
  panel(WHITE, 0, 2.95, 2.4, 0.3, 0.2);
  panel(GLASS, 0, 6.2, 1.6, 2.6, 0.1);
  // Two stone steps up to the door.
  const stepX = body.x + body.w / 2;
  b.box(STONE, [stepX + 0.6, 0.1, body.z], [1.2, 0.2, 3]);
  b.box(STONE, [stepX + 0.3, 0.3, body.z], [0.6, 0.2, 2.6]);

  // The bay that stands above the roof, the cupola on it, its pointed roof and the vane.
  const roof = body.h + ROOF;
  b.box(body.wall, [bay.x, (roof + bay.top) / 2, bay.z], [bay.w, bay.top - roof, bay.d]);
  b.box(CARR, [bay.x + bay.w / 2 + 0.03, (roof + bay.top) / 2, bay.z], [0.06, bay.top - roof - 0.6, bay.d - 1.2], {
    solid: false,
  });
  b.box(WHITE, [bay.x, (bay.top + cupola.top) / 2, bay.z], [cupola.side, cupola.top - bay.top, cupola.side]);
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    b.box(GLASS_DARK, [bay.x + dx * (cupola.side / 2 + 0.02), (bay.top + cupola.top) / 2, bay.z + dz * (cupola.side / 2 + 0.02)], [
      dx ? 0.04 : 0.7,
      0.9,
      dz ? 0.04 : 0.7,
    ], { solid: false });
  }
  b.box(SLATE, [bay.x, cupola.top + 0.08, bay.z], [cupola.side + 0.4, 0.16, cupola.side + 0.4]);
  b.limb(SLATE, [bay.x, cupola.top + 0.16, bay.z], [bay.x, cupola.point, bay.z], 1.1, 0.04, { sides: 4, solid: false });
  b.limb(GOLD, [bay.x, cupola.point - 0.1, bay.z], [bay.x, cupola.vane, bay.z], 0.03, 0.03, { sides: 4, solid: false });
  b.box(GOLD, [bay.x + 0.25, cupola.vane - 0.15, bay.z], [0.5, 0.18, 0.03], { solid: false });

  // An arm by the door for a bell.
  const hook = BELL_HOOKS['bell-hall'];
  b.limb(POST, [stepX, hook[1] + 0.06, hook[2]], [hook[0] + 0.15, hook[1] + 0.06, hook[2]], 0.05, 0.05, { sides: 5 });
}

/** Black and white cast iron: eight-sided base and shaft, a clock with four faces, a pointed roof and a vane. */
function clockTower(b: StaticBuilder): void {
  const { steps, base, shaft, clock, ledge, roof, vane } = TOWER;
  let foot = 0;
  for (const step of steps) {
    b.drum(STONE, [0, (foot + step.top) / 2, 0], step.radius, step.top - foot, 8);
    foot = step.top;
  }
  // The base: black, with a white band top and bottom and a white panel on every other side.
  b.drum(IRON, [0, (foot + base.top) / 2, 0], base.radius, base.top - foot, 8);
  b.drum(WHITE, [0, foot + 0.12, 0], base.radius + 0.08, 0.24, 8);
  b.drum(WHITE, [0, base.top - 0.1, 0], base.radius + 0.08, 0.2, 8);
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    const d = base.radius * Math.cos(Math.PI / 8) + 0.02;
    b.box(WHITE, [Math.sin(a) * d, (foot + base.top) / 2, Math.cos(a) * d], [0.62, base.top - foot - 0.9, 0.04], {
      yaw: a,
      solid: false,
    });
  }
  // The shaft: white, with black bands.
  b.drum(WHITE, [0, (base.top + shaft.top) / 2, 0], shaft.radius, shaft.top - base.top, 8);
  for (const y of [base.top + 0.5, (base.top + shaft.top) / 2, shaft.top - 0.4]) {
    b.drum(IRON, [0, y, 0], shaft.radius + 0.06, 0.22, 8);
  }

  // The clock, turned an eighth of a turn, with a face on each side.
  const turn = Math.PI / 4;
  const middle = (shaft.top + clock.top) / 2;
  b.box(IRON, [0, middle, 0], [clock.side, clock.top - shaft.top, clock.side], { yaw: turn });
  for (let i = 0; i < 4; i++) {
    const a = turn + (i * Math.PI) / 2;
    const [sx, sz] = [Math.sin(a), Math.cos(a)];
    const d = clock.side / 2;
    b.limb(WHITE, [sx * (d - 0.02), middle, sz * (d - 0.02)], [sx * (d + 0.06), middle, sz * (d + 0.06)], clock.face, clock.face, {
      sides: 20,
      solid: false,
    });
    // The hands: three o'clock.
    const hand = (u: number, y: number, w: number, h: number): void =>
      b.box(IRON, [sx * (d + 0.08) + Math.cos(a) * u, middle + y, sz * (d + 0.08) - Math.sin(a) * u], [w, h, 0.04], {
        yaw: a,
        solid: false,
      });
    hand(0, 0.3, 0.09, 0.66);
    hand(0.22, 0, 0.5, 0.1);
    b.limb(GOLD, [sx * (d + 0.08), middle, sz * (d + 0.08)], [sx * (d + 0.13), middle, sz * (d + 0.13)], 0.09, 0.09, {
      sides: 8,
      solid: false,
    });
  }
  // The ledge, the pointed roof with something solid inside it, and the vane.
  b.box(WHITE, [0, (clock.top + ledge.top) / 2, 0], [ledge.side, ledge.top - clock.top, ledge.side], { yaw: turn });
  b.limb(IRON, [0, ledge.top, 0], [0, roof.point, 0], roof.radius, 0.05, { sides: 4, solid: false });
  b.barrier([0, ledge.top + 0.5, 0], [1, 1, 1]);
  b.limb(GOLD, [0, roof.point - 0.1, 0], [0, vane, 0], 0.035, 0.035, { sides: 4, solid: false });
  b.blob(GOLD, [0, vane - 0.45, 0], 0.16, 1, 0);
  b.box(GOLD, [0.3, vane - 0.12, 0], [0.6, 0.2, 0.03], { solid: false });

  // An arm on the shaft for a bell.
  const hook = BELL_HOOKS['bell-tower'];
  b.limb(IRON, [0, TOWER_ARM, shaft.radius - 0.1], [0, TOWER_ARM, hook[2] + 0.2], 0.06, 0.06, { sides: 5 });
}

/** The stalls round the tower, the lamp posts, and the small things of a market place. */
function market(b: StaticBuilder): void {
  const [length, tableTop, depth] = STALL.table;
  const [awningLength, thickness, awningDepth] = STALL.awning;
  STALLS.forEach((stall, i) => {
    b.box(WOOD, onStall(stall, 0, 0, tableTop / 2), [length, tableTop, depth], { yaw: stall.yaw });
    for (const along of [-1, 1]) {
      for (const across of [-1, 1]) {
        const at = (y: number): Vec3 => onStall(stall, along * (awningLength / 2 - 0.15), across * (awningDepth / 2 - 0.15), y);
        b.limb(WHITE, at(0), at(STALL.top - thickness), 0.045, 0.045, { sides: 5 });
      }
    }
    b.box(stall.color, onStall(stall, 0, 0, STALL.top - thickness / 2), [awningLength, thickness, awningDepth], { yaw: stall.yaw });
    // White stripes on the awning, and a white edge along the front.
    for (const along of [-0.84, 0, 0.84]) {
      b.box(WHITE, onStall(stall, along, 0, STALL.top + 0.006), [0.34, 0.012, awningDepth], { yaw: stall.yaw, solid: false });
    }
    // Things for sale, in heaps at the back of the table.
    const goods = [0xd9483b, 0xf2a03d, 0x6fb552, 0xf4e04d];
    for (let k = 0; k < 4; k++) {
      b.blob(goods[(i + k) % goods.length], onStall(stall, -0.8 + k * 0.5, -0.3, tableTop + 0.07), 0.13, 0.8, 0);
    }
  });

  // Lamp posts: a post, an arm toward the tower, and a lamp under its end.
  for (const [x, , z] of LAMPS) {
    const toward = -Math.sign(x) * 0.8;
    b.limb(POST, [x, 0, z], [x, LAMP_HEIGHT, z], 0.1, 0.07, { sides: 6 });
    b.limb(POST, [x, LAMP_HEIGHT - 0.2, z], [x + toward, LAMP_HEIGHT - 0.2, z], 0.05, 0.05, { sides: 5 });
    b.blob(0xfff2c0, [x + toward, LAMP_HEIGHT - 0.5, z], 0.26, 1, 0);
  }
  // One lamp post has a second arm, for a bell.
  {
    const [x, , z] = BELL_LAMP;
    const hook = BELL_HOOKS['bell-lamp'];
    b.limb(POST, [x, hook[1] + 0.06, z], [hook[0] + 0.15, hook[1] + 0.06, z], 0.05, 0.05, { sides: 5 });
  }
  // A stall's bell hangs under its awning, which is solid already.

  // Benches along the sides of the market place.
  for (const [x, z, alongX] of [[-9, 15.5, 1], [9, 15.5, 1], [-9, -15.5, 1], [9, -15.5, 1], [15.5, -9, 0], [15.5, 9, 0]] as const) {
    b.box(WOOD, [x, 0.42, z], alongX ? [1.8, 0.1, 0.5] : [0.5, 0.1, 1.8]);
    for (const end of [-0.7, 0.7]) {
      b.box(POST, [x + (alongX ? end : 0), 0.19, z + (alongX ? 0 : end)], [0.12, 0.38, 0.12]);
    }
  }
  // A red pillar box and a red phone box, by the street up from the gate.
  b.drum(0xc8302b, [5.6, 0.7, 20.5], 0.32, 1.4, 10);
  b.drum(IRON, [5.6, 1.44, 20.5], 0.36, 0.08, 10);
  b.box(0xc8302b, [-5.9, 1.25, 31], [1.0, 2.5, 1.0]);
  b.box(GLASS_DARK, [-5.39, 1.4, 31], [0.02, 1.6, 0.7], { solid: false });
}

/** The greens behind the shops: trees, the pond, the bird table, the toy box, a bell post and the town sign's post. */
function greens(b: StaticBuilder): void {
  TREES.forEach((t, i) => tree(b, t, i));

  b.disc(WATER, POND, POND_RADIUS, 28);
  b.disc(0x8fdcf7, [POND[0] - 0.6, POND[1] + 0.005, POND[2] + 0.4], POND_RADIUS * 0.45, 18);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const r = POND_RADIUS + 0.2 + (i % 3) * 0.08;
    b.blob(i % 2 ? STONE : 0xcfcac2, [POND[0] + Math.cos(a) * r, 0.05, POND[2] + Math.sin(a) * r], 0.38 + (i % 3) * 0.06, 0.5, 0);
  }

  // A flat-topped stone for the bird table's tray to sit on.
  b.drum(STONE, [FEEDER[0], FEEDER[1] / 2, FEEDER[2]], 0.5, FEEDER[1], 9);
  // A mat under the toy box, so it is easy to spot from the air.
  b.disc(0xffe08a, [TOY_BOX[0], 0.004, TOY_BOX[2]], 2.2, 20);

  // The bell post by the street up from the gate: a post and an arm.
  {
    const [x, , z] = GATE_BELL_POST;
    const hook = BELL_HOOKS['bell-gate'];
    b.limb(WOOD, [x, 0, z], [x, hook[1] + 0.15, z], 0.07, 0.07, { sides: 6 });
    b.limb(WOOD, [x, hook[1] + 0.08, z], [hook[0] + 0.15, hook[1] + 0.08, z], 0.05, 0.05, { sides: 5 });
  }
  // The town sign's post and the back of its board. The board's picture is drawn by the lobby.
  {
    const [x, , z] = SIGN.post;
    b.limb(POST, [x, 0, z], [x, SIGN.height - SIGN.board / 2, z], 0.09, 0.07, { sides: 6 });
    b.box(WHITE, [x, SIGN.height, z], [SIGN.width + 0.12, SIGN.board + 0.12, 0.08]);
  }
  // Hedges along the backs of the shops, drawn only.
  for (const side of [-1, 1]) {
    for (let k = -3; k <= 3; k++) {
      if (k === 0) continue;
      b.blob(k % 2 ? 0x4aa63c : 0x5dbb4a, [k * 6.2, 0.5, side * (RING + 1.1)], 1.5, 0.6, 0);
      b.blob(k % 2 ? 0x5dbb4a : 0x4aa63c, [side * (RING + 1.1), 0.5, k * 6.2], 1.5, 0.6, 0);
    }
  }
}

/** Things seen over the roofs: more grass, hills and clouds. */
function farAway(b: StaticBuilder): void {
  b.disc(0x86c964, [0, -0.08, 0], 260, 32);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + 0.3;
    const d = 120 + (i % 3) * 25;
    b.blob(i % 2 ? 0x79bf5a : 0x6fb552, [Math.cos(a) * d, -4, Math.sin(a) * d], 30 + (i % 4) * 7, 0.4, 1);
  }
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + 0.9;
    const d = 90 + (i % 4) * 30;
    const [x, y, z] = [Math.cos(a) * d, 55 + (i % 3) * 14, Math.sin(a) * d];
    b.blob(0xffffff, [x, y, z], 12 + (i % 3) * 3, 0.45, 1);
    b.blob(0xffffff, [x + 11, y - 1, z + 4], 8, 0.45, 1);
    b.blob(0xf3f9ff, [x - 9, y - 2, z - 3], 9, 0.45, 1);
  }
}

/** Each ring of the course stands on a thin pole, drawn only. */
function ringPoles(b: StaticBuilder): void {
  for (const ring of CONTENT.rings) {
    const [x, y, z] = ring.position;
    b.limb(POST, [x, 0, z], [x, y - ring.radius, z], 0.04, 0.04, { sides: 4, solid: false });
  }
}
