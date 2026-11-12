import type { Vec3 } from '../world/types';

// Trees for a lobby's layout, as plain numbers: a trunk, branches to perch on
// and clumps of leaves. The lobby's scenery draws them and makes them solid.

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

/** Small repeatable random number generator, so a lobby is always the same. */
export function random(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A trunk with thick branches to perch on and leaf clumps over the branch ends. */
export function makeTree(
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
