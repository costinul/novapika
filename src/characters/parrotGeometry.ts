import {
  Color,
  ConeGeometry,
  Euler,
  Float32BufferAttribute,
  Matrix4,
  Quaternion,
  SphereGeometry,
  Vector3,
} from 'three';
import type { BufferGeometry } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { CharacterDef } from './types';

// Low-poly parrot models, built in code from a character's data.
//
// All shapes are made for a bird 1 unit tall standing at the origin and
// facing -Z, then scaled by the caller. Better art can replace this file
// without touching the character data or anything that uses the models.

/** Centre of the head, in a bird 1 unit tall. */
export const HEAD_CENTER = new Vector3(0, 0.8, -0.03);
/** Where the eyes are, which is where a player's headset sits. */
export const EYE_HEIGHT = 0.83;
/** Root of the crest, relative to the centre of the head. */
export const CREST_ROOT = new Vector3(0, 0.14, -0.03);
/** Where each wing joins the body, relative to the centre of the head. */
export const SHOULDER = new Vector3(0.13, -0.24, 0.04);
/** Crest tilt, radians back from upright: laid flat, and fully raised. */
export const CREST_FLAT = 1.0;
export const CREST_RAISED = 0.05;

type Paint = number | ((p: Vector3) => number);

const m = new Matrix4();
const q = new Quaternion();
const e = new Euler();
const a = new Vector3();
const b = new Vector3();
const c = new Vector3();
const color = new Color();

/**
 * Place a shape and paint it. Each triangle gets one flat colour, chosen by
 * where its middle is, which keeps markings crisp.
 */
function shape(
  geometry: BufferGeometry,
  position: [number, number, number],
  scale: [number, number, number],
  rotation: [number, number, number],
  paint: Paint,
): BufferGeometry {
  const flat = geometry.index ? geometry.toNonIndexed() : geometry;
  if (flat !== geometry) geometry.dispose();
  flat.deleteAttribute('uv');
  q.setFromEuler(e.set(...rotation));
  flat.applyMatrix4(m.compose(a.set(...position), q, b.set(...scale)));

  const pos = flat.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i);
    b.fromBufferAttribute(pos, i + 1);
    c.fromBufferAttribute(pos, i + 2);
    a.add(b).add(c).multiplyScalar(1 / 3);
    color.set(typeof paint === 'number' ? paint : paint(a));
    for (let k = 0; k < 3; k++) color.toArray(colors, (i + k) * 3);
  }
  flat.setAttribute('color', new Float32BufferAttribute(colors, 3));
  return flat;
}

const ball = (w = 10, h = 8): SphereGeometry => new SphereGeometry(1, w, h);
/** Do something once for each side of the bird: -1 is its left, +1 its right. */
const bothSides = <T>(make: (side: number) => T): T[] => [make(-1), make(1)];

function merge(parts: BufferGeometry[]): BufferGeometry {
  const merged = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  return merged;
}

/** Torso, tail and feet. The origin is on the ground between the feet. */
function bodyParts(def: CharacterDef): BufferGeometry[] {
  const col = def.colors;
  const torso = shape(ball(12, 10), [0, 0.37, 0.05], [0.2, 0.3, 0.22], [0.25, 0, 0], (p) => {
    if (p.z > 0.03) return col.back;
    // Front, from the top down: a bib under the head, chest band, belly.
    if (p.y > 0.53) return col.head;
    return p.y > 0.4 ? col.chest : col.belly;
  });

  const tail = [-0.13, 0, 0.13].map((fan) =>
    shape(
      new ConeGeometry(0.05, def.tail, 4).translate(0, def.tail / 2, 0),
      [0, 0.25, 0.19],
      [1, 1, 0.3],
      [Math.PI - 0.5, 0, fan],
      col.tail,
    ),
  );

  const feet = bothSides((side) => shape(ball(6, 4), [side * 0.07, 0.03, -0.03], [0.045, 0.03, 0.07], [0, 0, 0], col.feet));
  return [torso, ...tail, ...feet];
}

/** Wings folded against the body, for a bird that is not flying. */
function foldedWings(def: CharacterDef): BufferGeometry[] {
  const col = def.colors;
  return bothSides((side) =>
    shape(ball(8, 6), [side * 0.19, 0.44, 0.09], [0.05, 0.21, 0.17], [0.35, 0, 0], (p) => {
      if (p.y < 0.3) return col.wingTip;
      // The lighter patch sits on the lower front of the folded wing.
      return col.wingPatch !== undefined && p.y < 0.5 && p.z < 0.14 ? col.wingPatch : col.wing;
    }),
  );
}

/** Head, face and beak. The origin is the centre of the head. */
function headParts(def: CharacterDef): BufferGeometry[] {
  const col = def.colors;
  const parts: BufferGeometry[] = [];

  parts.push(
    shape(ball(12, 10), [0, 0, 0], [0.17, 0.17, 0.17], [0, 0, 0], (p) => {
      const striped = col.headStripes !== undefined && p.z > -0.02 && Math.floor((p.y + 1) * 22) % 2 === 0;
      return striped ? col.headStripes! : col.head;
    }),
  );
  // A short, rounded upper beak with a hooked tip, over a small lower one.
  parts.push(shape(ball(8, 6), [0, -0.03, -0.155], [0.05, 0.05, 0.055], [0, 0, 0], col.beak));
  parts.push(shape(new ConeGeometry(0.035, 0.07, 6), [0, -0.075, -0.185], [1, 1, 1], [Math.PI - 0.25, 0, 0], col.beak));
  parts.push(shape(ball(6, 4), [0, -0.085, -0.13], [0.035, 0.022, 0.035], [0, 0, 0], col.beak));

  for (const side of [-1, 1]) {
    if (col.facePatch !== undefined) {
      parts.push(shape(ball(8, 6), [side * 0.125, -0.005, -0.075], [0.04, 0.1, 0.1], [0, 0, 0], col.facePatch));
    }
    if (col.eyeRing !== undefined) {
      parts.push(shape(ball(8, 6), [side * 0.13, 0.035, -0.095], [0.02, 0.034, 0.034], [0, 0, 0], col.eyeRing));
    }
    parts.push(shape(ball(8, 6), [side * 0.138, 0.035, -0.097], [0.02, 0.023, 0.023], [0, 0, 0], col.eye));
    if (col.cheek !== undefined) {
      parts.push(shape(ball(8, 6), [side * 0.146, -0.04, -0.015], [0.032, 0.075, 0.075], [0, 0, 0], col.cheek));
    }
    if (col.neckSmudge !== undefined) {
      parts.push(shape(ball(6, 5), [side * 0.135, -0.1, 0.035], [0.03, 0.05, 0.045], [0, 0, 0.2 * side], col.neckSmudge));
    }
  }
  return parts;
}

/**
 * Crest feathers, standing up from the origin and leaning back a little more
 * each. Tilt the whole crest about X to raise or flatten it.
 */
function crestParts(def: CharacterDef): BufferGeometry[] {
  const crest = def.crest;
  if (!crest) return [];
  const parts: BufferGeometry[] = [];
  for (let i = 0; i < crest.feathers; i++) {
    const length = crest.length * (1 - 0.6 * (i / crest.feathers));
    parts.push(
      shape(
        new ConeGeometry(crest.width / 2, length, 4).translate(0, length / 2, 0),
        [0, 0, i * 0.022],
        [1, 1, 0.4],
        [0.1 + i * 0.13, 0, 0],
        crest.color,
      ),
    );
  }
  return parts;
}

export interface ParrotParts {
  /** Origin on the ground between the feet. */
  body: BufferGeometry;
  /** Origin at the centre of the head. */
  head: BufferGeometry;
  /** Origin at the crest's root; null for a bird with no crest. */
  crest: BufferGeometry | null;
}

/** Separate parts for a live parrot, whose head and crest move. */
export function buildParrotParts(def: CharacterDef): ParrotParts {
  const crest = crestParts(def);
  return {
    body: merge(bodyParts(def)),
    head: merge(headParts(def)),
    crest: crest.length > 0 ? merge(crest) : null,
  };
}

/** A whole perched parrot as one shape, wings folded and crest up. */
export function buildStatue(def: CharacterDef): BufferGeometry {
  const head = merge(headParts(def)).translate(HEAD_CENTER.x, HEAD_CENTER.y, HEAD_CENTER.z);
  const parts = [...bodyParts(def), ...foldedWings(def), head];
  const crest = crestParts(def);
  if (crest.length > 0) {
    parts.push(
      merge(crest)
        .rotateX(0.25)
        .translate(HEAD_CENTER.x + CREST_ROOT.x, HEAD_CENTER.y + CREST_ROOT.y, HEAD_CENTER.z + CREST_ROOT.z),
    );
  }
  return merge(parts);
}

/** One wing feather: a flat leaf from its root at the origin to its tip at +Y. */
export function featherGeometry(): BufferGeometry {
  return new ConeGeometry(0.2, 1, 4).translate(0, 0.5, 0).scale(1, 1, 0.12);
}
