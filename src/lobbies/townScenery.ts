import type { StaticBuilder } from './build';
import { ROOF } from './town';
import type { Building, Facing } from './town';

// How a town's buildings are drawn: walls and a flat roof, solid, with flat
// panels on the front for windows, doors and shop fronts.

const SLATE = 0x5c6370;
const GLASS = 0x9cc4dd;
const GLASS_DARK = 0x3d5266;
const WHITE = 0xf4f1e8;
const BRICK = 0xb55a3c;

/** For each way a front can face: the turn that faces it, and a step straight out of it. */
const OUT: Record<Facing, { yaw: number; x: number; z: number }> = {
  s: { yaw: 0, x: 0, z: 1 },
  n: { yaw: Math.PI, x: 0, z: -1 },
  e: { yaw: Math.PI / 2, x: 1, z: 0 },
  w: { yaw: -Math.PI / 2, x: -1, z: 0 },
};

/** How to put flat things on a building's front. */
export function front(b: StaticBuilder, building: Building) {
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
export function windows(b: StaticBuilder, building: Building, from: number): void {
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
export function shell(b: StaticBuilder, building: Building): void {
  const { x, z, w, d, h, wall } = building;
  b.box(wall, [x, h / 2, z], [w, h, d]);
  b.box(SLATE, [x, h + ROOF / 2, z], [w + 0.3, ROOF, d + 0.3]);
  if (building.chimney) b.box(BRICK, [x + w / 4, h + ROOF + 0.6, z], [0.7, 1.2, 0.7]);
}

/** A shop: a painted front with a big window and a door, and windows above. */
export function shop(b: StaticBuilder, building: Building): void {
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
export function house(b: StaticBuilder, building: Building, door: number): void {
  shell(b, building);
  const { width, panel } = front(b, building);
  panel(door, -width / 2 + 1.2, 1.05, 0.9, 2.1, 0.08);
  windows(b, building, 0.2);
}

/** Things seen over the roofs: more grass, at height `ground`, and hills and clouds. */
export function farAway(b: StaticBuilder, ground = -0.08): void {
  b.disc(0x86c964, [0, ground, 0], 260, 32);
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
