import type { Vec3 } from '../../world/types';
import type { StaticBuilder } from '../build';
import {
  BELL_HOOKS,
  CONTENT,
  FEEDER,
  GYM,
  GYM_HALF,
  GYM_HEIGHT,
  HALF,
  HEIGHT,
  HOME_CROWN,
  HOME_LOW_BRANCHES,
  HOME_TRUNK,
  LOOKOUT,
  NEST_RADIUS,
  NEST_Y,
  PADS,
  POND,
  POND_RADIUS,
  PORTAL,
  TOY_BOX,
  TREES,
} from './layout';
import type { Limb, Tree } from './layout';

// The Aviary's fixed scenery, as coloured shapes with colliders. No textures
// and nothing from the browser, so tests can build the same world.

const BARK = 0x9a6b3f;
const BARK_DARK = 0x7d5430;
const LEAF = [0x5dbb4a, 0x74c95a, 0x4aa63c, 0x8ad468];
const GRASS = 0x8fd46a;
const GRASS_DARK = 0x7cc558;
const WOOD = 0xd9a05b;
const ROPE = 0xf0e2c0;
const POST = 0xb9c2cc;
const STONE = 0xb5b0a8;
const WATER = 0x5cc8f0;

const limb = (b: StaticBuilder, color: number, l: Limb, sides?: number): void =>
  b.limb(color, l.a, l.b, l.radiusA, l.radiusB, { sides });

function tree(b: StaticBuilder, t: Tree, leafShift: number): void {
  limb(b, BARK, t.trunk, 8);
  for (const branch of t.branches) limb(b, BARK_DARK, branch, 6);
  t.leaves.forEach((leaf, i) => b.blob(LEAF[(i + leafShift) % LEAF.length], leaf.center, leaf.radius, 0.75));
}

export function buildScenery(b: StaticBuilder): void {
  // --- Ground and netting ---------------------------------------------------
  b.box(GRASS, [0, -0.5, 0], [2 * HALF, 1, 2 * HALF]);
  for (const [x, z, r] of [[-6, 9, 4], [9, 3, 3], [-18, -14, 5], [18, 16, 4], [4, -20, 4.5], [-22, 4, 3]]) {
    b.disc(GRASS_DARK, [x, 0.01, z], r);
  }
  // The netting is drawn separately; these are its solid sides and roof.
  const wall = 1;
  b.barrier([HALF + wall / 2, HEIGHT / 2, 0], [wall, HEIGHT, 2 * HALF]);
  b.barrier([-HALF - wall / 2, HEIGHT / 2, 0], [wall, HEIGHT, 2 * HALF]);
  b.barrier([0, HEIGHT / 2, HALF + wall / 2], [2 * HALF, HEIGHT, wall]);
  b.barrier([0, HEIGHT / 2, -HALF - wall / 2], [2 * HALF, HEIGHT, wall]);
  b.barrier([0, HEIGHT + wall / 2, 0], [2 * HALF, wall, 2 * HALF]);
  // Corner posts and top rails that the net hangs from.
  const c = HALF - 0.4;
  for (const [x, z] of [[c, c], [-c, c], [c, -c], [-c, -c]]) {
    b.limb(POST, [x, 0, z], [x, HEIGHT, z], 0.35, 0.3, { sides: 8 });
  }
  b.limb(POST, [c, HEIGHT - 0.3, c], [-c, HEIGHT - 0.3, c], 0.18, 0.18, { sides: 5 });
  b.limb(POST, [c, HEIGHT - 0.3, -c], [-c, HEIGHT - 0.3, -c], 0.18, 0.18, { sides: 5 });
  b.limb(POST, [c, HEIGHT - 0.3, c], [c, HEIGHT - 0.3, -c], 0.18, 0.18, { sides: 5 });
  b.limb(POST, [-c, HEIGHT - 0.3, c], [-c, HEIGHT - 0.3, -c], 0.18, 0.18, { sides: 5 });
  // Lookout platform high on one corner post.
  b.drum(WOOD, [LOOKOUT[0], LOOKOUT[1] - 0.1, LOOKOUT[2]], 1.2, 0.2, 10);

  // --- Home tree and nest ---------------------------------------------------
  limb(b, BARK, HOME_TRUNK, 10);
  for (const branch of HOME_LOW_BRANCHES) {
    limb(b, BARK_DARK, branch, 7);
    b.blob(LEAF[1], [branch.b[0], branch.b[1] + 1.3, branch.b[2]], 1.5, 0.75);
  }
  b.drum(0xb9884f, [0, NEST_Y - 0.15, 0], NEST_RADIUS, 0.3, 18);
  // Woven rim of twigs, low enough to hop over.
  const twigs = 14;
  for (let i = 0; i < twigs; i++) {
    const a0 = (i / twigs) * Math.PI * 2;
    const a1 = ((i + 1.25) / twigs) * Math.PI * 2;
    const y = NEST_Y + 0.12 + (i % 2) * 0.1;
    b.limb(
      i % 2 ? 0xa8763f : 0xc79a5e,
      [Math.cos(a0) * NEST_RADIUS, y, Math.sin(a0) * NEST_RADIUS],
      [Math.cos(a1) * NEST_RADIUS, y, Math.sin(a1) * NEST_RADIUS],
      0.13,
      0.13,
      { sides: 5 },
    );
  }
  tree(b, HOME_CROWN, 0);
  for (const pad of PADS) b.drum(WOOD, [pad[0], pad[1] - 0.04, pad[2]], 0.35, 0.08, 8);

  // --- Climbing trees -------------------------------------------------------
  TREES.forEach((t, i) => tree(b, t, i));

  // --- Bell hangers ---------------------------------------------------------
  // Nest bell: an arm from the upper trunk.
  const nestHook = BELL_HOOKS['bell-nest'];
  b.limb(BARK_DARK, [0, nestHook[1] + 0.1, 0], [nestHook[0] - 0.2, nestHook[1] + 0.1, nestHook[2]], 0.1, 0.08, { sides: 5 });
  // Feeder bell: a stand of a post and an arm.
  const feederHook = BELL_HOOKS['bell-feeder'];
  b.limb(WOOD, [feederHook[0] + 0.5, 0, feederHook[2]], [feederHook[0] + 0.5, feederHook[1] + 0.15, feederHook[2]], 0.07, 0.07, { sides: 6 });
  b.limb(WOOD, [feederHook[0] + 0.5, feederHook[1] + 0.08, feederHook[2]], [feederHook[0] - 0.1, feederHook[1] + 0.08, feederHook[2]], 0.05, 0.05, { sides: 5 });

  playGym(b);

  // --- Bird bath ------------------------------------------------------------
  b.disc(WATER, POND, POND_RADIUS, 28);
  b.disc(0x8fdcf7, [POND[0] - 0.6, POND[1] + 0.005, POND[2] + 0.4], POND_RADIUS * 0.45, 18);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const r = POND_RADIUS + 0.2 + (i % 3) * 0.08;
    b.blob(i % 2 ? STONE : 0xcfcac2, [POND[0] + Math.cos(a) * r, 0.05, POND[2] + Math.sin(a) * r], 0.38 + (i % 3) * 0.06, 0.5, 0);
  }

  // --- Feeder ---------------------------------------------------------------
  // A flat-topped stump for the feeding tray to sit on.
  b.drum(BARK, [FEEDER[0], FEEDER[1] / 2, FEEDER[2]], 0.5, FEEDER[1], 9);

  // --- Toy box: a mat under it, so it is easy to spot from the air -----------
  b.disc(0xffe08a, [TOY_BOX[0], 0.015, TOY_BOX[2]], 2.2, 20);

  // --- Ring course: each ring hangs on a cable from the roof ------------------
  for (const ring of CONTENT.rings) {
    const [x, y, z] = ring.position;
    b.limb(POST, [x, y + ring.radius, z], [x, HEIGHT, z], 0.02, 0.02, { sides: 4, solid: false });
  }

  portal(b);
  farAway(b);
}

/** Like a giant version of a pet parrot's play stand. */
function playGym(b: StaticBuilder): void {
  const [gx, , gz] = GYM;
  const h = GYM_HALF;
  const top = GYM_HEIGHT;
  const at = (x: number, y: number, z: number): Vec3 => [gx + x, y, gz + z];
  const FRAME = 0xff8a5c;
  const BAR = 0x5aa9f0;

  // Frame: four posts, a square of top beams and one across the middle.
  for (const [x, z] of [[h, h], [-h, h], [h, -h], [-h, -h]]) {
    b.limb(FRAME, at(x, 0, z), at(x, top, z), 0.16, 0.16, { sides: 8 });
  }
  b.limb(FRAME, at(-h, top, -h), at(h, top, -h), 0.13);
  b.limb(FRAME, at(-h, top, h), at(h, top, h), 0.13);
  b.limb(FRAME, at(-h, top, -h), at(-h, top, h), 0.13);
  b.limb(FRAME, at(h, top, -h), at(h, top, h), 0.13);
  b.limb(FRAME, at(-h, top, 0), at(h, top, 0), 0.13);
  // A flat corner on top, where something shiny is hidden.
  b.drum(WOOD, at(-h, top + 0.1, -h), 0.45, 0.08, 8);

  // Ladder up the front: two rails and rungs.
  for (const x of [-0.4, 0.4]) b.limb(WOOD, at(x, 0, h), at(x, top, h), 0.06, 0.06, { sides: 6 });
  for (let y = 0.4; y < top; y += 0.5) b.limb(WOOD, at(-0.4, y, h), at(0.4, y, h), 0.045, 0.045, { sides: 5 });

  // Ropes hanging from the middle beam.
  for (const x of [-1.6, -0.6, 0.6]) b.limb(ROPE, at(x, top, 0), at(x, 0.5, 0), 0.05, 0.05, { sides: 5 });

  // Swings: a bar on two ropes.
  for (const [z, y] of [[-1.5, 1.2], [-0.6, 2.2]] as const) {
    b.limb(ROPE, at(1.3, top, z), at(1.3, y, z), 0.03, 0.03, { sides: 4 });
    b.limb(ROPE, at(2.1, top, z), at(2.1, y, z), 0.03, 0.03, { sides: 4 });
    b.limb(BAR, at(1.1, y, z), at(2.3, y, z), 0.07, 0.07, { sides: 6 });
  }

  // Hanging perches: a short bar on one rope, at different heights.
  for (const [x, z, y] of [[-1.5, -1.6, 3.4], [-0.3, -1.9, 2.4], [-1.9, 1.3, 1.4]] as const) {
    b.limb(ROPE, at(x, top, z), at(x, y, z), 0.03, 0.03, { sides: 4 });
    b.limb(BAR, at(x - 0.45, y, z), at(x + 0.45, y, z), 0.07, 0.07, { sides: 6 });
  }

  // Low perch rails round the outside, at standing height.
  b.limb(BAR, at(-h, 0.55, -h), at(-h, 0.55, h), 0.07, 0.07, { sides: 6 });
  b.limb(BAR, at(h, 0.55, -h), at(h, 0.55, h), 0.07, 0.07, { sides: 6 });
}

/** A closed doorway with a perch in front: the way to future lobbies. */
function portal(b: StaticBuilder): void {
  const [px, , pz] = PORTAL;
  const STONE_LIGHT = 0xd8d2e8;
  b.box(STONE_LIGHT, [px, 0.2, pz], [5, 0.4, 3]);
  for (const x of [-1.5, 1.5]) b.limb(STONE_LIGHT, [px + x, 0.4, pz - 0.8], [px + x, 4, pz - 0.8], 0.3, 0.26, { sides: 8 });
  b.limb(STONE_LIGHT, [px - 1.8, 4, pz - 0.8], [px + 1.8, 4, pz - 0.8], 0.28, 0.28, { sides: 8 });
  b.drum(STONE_LIGHT, [px, 4.3, pz - 0.8], 0.4, 0.08, 8);
  // The door itself: shut, with bars across it.
  b.box(0x7a5bd6, [px, 2.2, pz - 0.85], [2.7, 3.5, 0.12]);
  b.box(0x9d84ea, [px, 2.2, pz - 0.76], [1.9, 2.6, 0.06], { solid: false });
  b.box(0x5a3fb0, [px, 2.9, pz - 0.72], [2.7, 0.16, 0.06], { solid: false });
  b.box(0x5a3fb0, [px, 1.5, pz - 0.72], [2.7, 0.16, 0.06], { solid: false });
  // Perch in front of the door.
  for (const x of [-0.9, 0.9]) b.limb(WOOD, [px + x, 0.4, pz + 0.7], [px + x, 1.0, pz + 0.7], 0.06, 0.06, { sides: 6 });
  b.limb(WOOD, [px - 1.1, 1.0, pz + 0.7], [px + 1.1, 1.0, pz + 0.7], 0.08, 0.08, { sides: 6 });
}

/** Things seen through the netting: more grass, hills and clouds. */
function farAway(b: StaticBuilder): void {
  b.disc(0x86c964, [0, -0.02, 0], 260, 32);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + 0.3;
    const d = 110 + (i % 3) * 25;
    b.blob(i % 2 ? 0x79bf5a : 0x6fb552, [Math.cos(a) * d, -4, Math.sin(a) * d], 34 + (i % 4) * 8, 0.45, 1);
  }
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 1;
    const d = 70 + (i % 3) * 30;
    const center: Vec3 = [Math.cos(a) * d, 55 + (i % 4) * 9, Math.sin(a) * d];
    b.blob(0xffffff, center, 11, 0.4, 1);
    b.blob(0xffffff, [center[0] + 9, center[1] - 1, center[2] + 3], 8, 0.4, 1);
    b.blob(0xffffff, [center[0] - 8, center[1] - 1.5, center[2] - 2], 7, 0.4, 1);
  }
}
