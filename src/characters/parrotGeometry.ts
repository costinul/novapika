import {
  Color,
  ConeGeometry,
  Euler,
  Float32BufferAttribute,
  Matrix4,
  Quaternion,
  SphereGeometry,
  SRGBColorSpace,
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
const hue = new Color();
const Z_AXIS = new Vector3(0, 0, 1);

/**
 * Feather colour. A rainbow bird's feathers run round the colour wheel from
 * its feet to its crest, in place of the bird's own colours. `lift` is how
 * high the part's origin is above the feet.
 */
function plumage(def: CharacterDef, own: Paint, lift = 0): Paint {
  if (!def.specials?.rainbow) return own;
  return (p) => hue.setHSL((p.y + lift) * 1.1 - p.z * 0.6, 0.95, 0.56, SRGBColorSpace).getHex();
}

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
/**
 * A ball for part of a head. A bird with ten heads has each so small that
 * coarser shapes look the same, and they keep it cheap to draw. One with
 * twenty has them smaller and coarser still.
 */
function headBall(def: CharacterDef, w: number, h: number): SphereGeometry {
  const heads = def.specials?.heads ?? 1;
  if (heads > 10) return ball(Math.max(4, w - 6), Math.max(3, h - 5));
  return heads > 3 ? ball(Math.max(4, w - 4), Math.max(3, h - 2)) : ball(w, h);
}
/** Do something once for each side of the bird: -1 is its left, +1 its right. */
const bothSides = <T>(make: (side: number) => T): T[] => [make(-1), make(1)];

function merge(parts: BufferGeometry[]): BufferGeometry {
  const merged = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  return merged;
}

/** The widest a bird's tails fan out, from the leftmost to the rightmost, radians. */
const TAIL_FAN = 2.8;

/** Torso, tail and feet. The origin is on the ground between the feet. */
function bodyParts(def: CharacterDef): BufferGeometry[] {
  const col = def.colors;
  const torso = shape(
    ball(12, 10),
    [0, 0.37, 0.05],
    [0.2, 0.3, 0.22],
    [0.25, 0, 0],
    plumage(def, (p) => {
      if (p.z > 0.03) return col.back;
      // Front, from the top down: a bib under the head, chest band, belly.
      if (p.y > 0.53) return col.head;
      return p.y > 0.4 ? col.chest : col.belly;
    }),
  );

  // A tail is a fan of three feathers. Extra tails splay out to the sides
  // and lift a little, so each can be told from the next. Ten or more close
  // up into one wide fan, like a peacock's, instead of wrapping round the bird.
  const tails = def.specials?.tails ?? 1;
  const apart = Math.min(0.6, TAIL_FAN / Math.max(1, tails - 1));
  const tail: BufferGeometry[] = [];
  for (let k = 0; k < tails; k++) {
    const splay = (k - (tails - 1) / 2) * apart;
    for (const fan of [-0.13, 0, 0.13]) {
      tail.push(
        shape(
          new ConeGeometry(0.05, def.tail, 4).translate(0, def.tail / 2, 0),
          [0, 0.25, 0.19],
          [1, 1, 0.3],
          [Math.PI - 0.5 - Math.abs(splay) * 0.5, 0, fan + splay],
          plumage(def, col.tail),
        ),
      );
    }
  }

  const feet = bothSides((side) => shape(ball(6, 4), [side * 0.07, 0.03, -0.03], [0.045, 0.03, 0.07], [0, 0, 0], col.feet));
  return [torso, ...tail, ...feet];
}

/** Wings folded against the body, for a bird that is not flying. */
function foldedWings(def: CharacterDef): BufferGeometry[] {
  const col = def.colors;
  return bothSides((side) =>
    shape(
      ball(8, 6),
      [side * 0.19, 0.44, 0.09],
      [0.05, 0.21, 0.17],
      [0.35, 0, 0],
      plumage(def, (p) => {
        if (p.y < 0.3) return col.wingTip;
        // The lighter patch sits on the lower front of the folded wing.
        return col.wingPatch !== undefined && p.y < 0.5 && p.z < 0.14 ? col.wingPatch : col.wing;
      }),
    ),
  );
}

/** Head, face and beak. The origin is the centre of the head. */
function headParts(def: CharacterDef): BufferGeometry[] {
  const col = def.colors;
  const parts: BufferGeometry[] = [];

  parts.push(
    shape(
      headBall(def, 12, 10),
      [0, 0, 0],
      [0.17, 0.17, 0.17],
      [0, 0, 0],
      plumage(
        def,
        (p) => {
          const striped = col.headStripes !== undefined && p.z > -0.02 && Math.floor((p.y + 1) * 22) % 2 === 0;
          return striped ? col.headStripes! : col.head;
        },
        HEAD_CENTER.y,
      ),
    ),
  );
  // A short, rounded upper beak with a hooked tip, over a small lower one.
  parts.push(shape(headBall(def, 8, 6), [0, -0.03, -0.155], [0.05, 0.05, 0.055], [0, 0, 0], col.beak));
  parts.push(shape(new ConeGeometry(0.035, 0.07, 6), [0, -0.075, -0.185], [1, 1, 1], [Math.PI - 0.25, 0, 0], col.beak));
  parts.push(shape(headBall(def, 6, 4), [0, -0.085, -0.13], [0.035, 0.022, 0.035], [0, 0, 0], col.beak));
  if (col.beakStain !== undefined) {
    // A blotch on the front of the upper beak, a little to one side.
    parts.push(shape(ball(6, 5), [0.016, -0.018, -0.2], [0.024, 0.026, 0.014], [0, 0, 0], col.beakStain));
  }

  for (const side of [-1, 1]) {
    if (col.facePatch !== undefined) {
      parts.push(shape(ball(8, 6), [side * 0.125, -0.005, -0.075], [0.04, 0.1, 0.1], [0, 0, 0], col.facePatch));
    }
    if (col.eyeRing !== undefined) {
      parts.push(shape(ball(8, 6), [side * 0.13, 0.035, -0.095], [0.02, 0.034, 0.034], [0, 0, 0], col.eyeRing));
    }
    if (def.specials?.eyeDots === 2) {
      // A big pale eye with two pupils side by side.
      parts.push(shape(ball(8, 6), [side * 0.132, 0.035, -0.094], [0.024, 0.038, 0.038], [0, 0, 0], 0xffffff));
      for (const along of [-1, 1]) {
        parts.push(
          shape(
            ball(6, 5),
            [side * (0.15 + along * 0.0104), 0.038, -0.105 + along * 0.0147],
            [0.012, 0.014, 0.014],
            [0, 0, 0],
            col.eye,
          ),
        );
      }
    } else {
      parts.push(shape(headBall(def, 8, 6), [side * 0.138, 0.035, -0.097], [0.02, 0.023, 0.023], [0, 0, 0], col.eye));
    }
    if (col.cheek !== undefined) {
      parts.push(shape(ball(8, 6), [side * 0.146, -0.04, -0.015], [0.032, 0.075, 0.075], [0, 0, 0], col.cheek));
    }
    if (col.neckSmudge !== undefined) {
      parts.push(shape(ball(6, 5), [side * 0.135, -0.1, 0.035], [0.03, 0.05, 0.045], [0, 0, 0.2 * side], col.neckSmudge));
    }
  }
  if (def.specials?.thirdEye) {
    // A third eye high on the forehead, lying on the curve of the head. Seen
    // from the front, the three eyes are the tips of a triangle.
    parts.push(shape(headBall(def, 8, 6), [0, 0.121, -0.121], [0.03, 0.03, 0.012], [0.78, 0, 0], 0xffffff));
    parts.push(shape(headBall(def, 6, 5), [0, 0.129, -0.129], [0.017, 0.017, 0.008], [0.78, 0, 0], col.eye));
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
        plumage(def, crest.color, HEAD_CENTER.y + CREST_ROOT.y),
      ),
    );
  }
  return parts;
}

interface HeadSeat {
  /** Where the head sits, measured from a lone head's place. */
  x: number;
  y: number;
  /** Left out, it is level with a lone head. */
  z?: number;
  /** How far it leans outward, radians. */
  lean: number;
  /** Its size against a lone head. */
  size: number;
}

/**
 * A crown of small heads on long necks, in rows fanned out one behind the
 * other. Each row is how many heads, how far up from where the necks meet,
 * how wide the fan is to each side in radians, and how far back it stands.
 * A row has an even number of heads, so that none is straight above the body:
 * only a head off to one side is given a neck.
 */
function crown(size: number, rows: [heads: number, reach: number, spread: number, z: number][]): HeadSeat[] {
  const seats: HeadSeat[] = [];
  for (const [heads, reach, spread, z] of rows) {
    for (let i = 0; i < heads; i++) {
      const angle = (i / (heads - 1) - 0.5) * 2 * spread;
      seats.push({
        x: NECK_ROOT.x + reach * Math.sin(angle),
        y: NECK_ROOT.y + reach * Math.cos(angle),
        z,
        lean: -angle * 0.6,
        size,
      });
    }
  }
  return seats;
}

/** A bird with several heads carries them side by side, smaller and leaning apart. */
function headSeats(def: CharacterDef): HeadSeat[] {
  switch (def.specials?.heads ?? 1) {
    case 2:
      return [
        { x: -0.15, y: -0.02, lean: 0.35, size: 0.85 },
        { x: 0.15, y: -0.02, lean: -0.35, size: 0.85 },
      ];
    case 3:
      return [
        { x: -0.23, y: -0.07, lean: 0.55, size: 0.75 },
        { x: 0, y: 0.03, lean: 0, size: 0.75 },
        { x: 0.23, y: -0.07, lean: -0.55, size: 0.75 },
      ];
    case 10:
      // Six fanned out behind, four in front of them.
      return crown(0.44, [
        [6, 0.4, 1.4, 0.03],
        [4, 0.25, 0.94, -0.05],
      ]);
    case 20:
      // Eight behind, eight before them, four in front.
      return crown(0.34, [
        [8, 0.54, 1.45, 0.06],
        [8, 0.39, 1.3, 0],
        [4, 0.24, 0.9, -0.06],
      ]);
    default:
      return [{ x: 0, y: 0, lean: 0, size: 1 }];
  }
}

/** Where the necks of a many-headed bird meet, measured from a lone head's centre. */
const NECK_ROOT = { x: 0, y: -0.24 };

/** A neck from a head that sits off to one side down to the top of the body. */
function neck(def: CharacterDef, seat: HeadSeat): BufferGeometry {
  const dx = NECK_ROOT.x - seat.x;
  const dy = NECK_ROOT.y - seat.y;
  const thick = 0.08 * seat.size;
  return shape(
    headBall(def, 8, 6),
    [seat.x + dx / 2, seat.y + dy / 2, 0.01 + (seat.z ?? 0) / 2],
    [thick, Math.hypot(dx, dy) / 2 + 0.03, thick],
    [0, 0, Math.atan2(-dx, dy)],
    plumage(def, def.colors.head, HEAD_CENTER.y),
  );
}

const together = (parts: BufferGeometry[]): BufferGeometry => (parts.length === 1 ? parts[0] : merge(parts));

/** Every head of the bird as one shape. The origin is the centre of a lone head. */
function allHeads(def: CharacterDef): BufferGeometry {
  const parts: BufferGeometry[] = [];
  for (const seat of headSeats(def)) {
    parts.push(
      merge(headParts(def)).scale(seat.size, seat.size, seat.size).rotateZ(seat.lean).translate(seat.x, seat.y, seat.z ?? 0),
    );
    if (seat.x !== 0) parts.push(neck(def, seat));
  }
  return together(parts);
}

/** The crest of every head as one shape. The origin is a lone head's crest root. */
function allCrests(def: CharacterDef): BufferGeometry | null {
  if (!def.crest) return null;
  return together(
    headSeats(def).map((seat) => {
      const crest = merge(crestParts(def)).scale(seat.size, seat.size, seat.size).rotateZ(seat.lean);
      // This head's crest root, measured from a lone head's.
      a.copy(CREST_ROOT).multiplyScalar(seat.size).applyAxisAngle(Z_AXIS, seat.lean).sub(CREST_ROOT);
      return crest.translate(a.x + seat.x, a.y + seat.y, a.z + (seat.z ?? 0));
    }),
  );
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
  return {
    body: merge(bodyParts(def)),
    head: allHeads(def),
    crest: allCrests(def),
  };
}

/** A whole perched parrot as one shape, wings folded and crest up. */
export function buildStatue(def: CharacterDef): BufferGeometry {
  const head = allHeads(def).translate(HEAD_CENTER.x, HEAD_CENTER.y, HEAD_CENTER.z);
  const parts = [...bodyParts(def), ...foldedWings(def), head];
  const crest = allCrests(def);
  if (crest) {
    parts.push(
      crest
        .rotateX(0.25)
        .translate(HEAD_CENTER.x + CREST_ROOT.x, HEAD_CENTER.y + CREST_ROOT.y, HEAD_CENTER.z + CREST_ROOT.z),
    );
  }
  return merge(parts);
}

/** One wing feather: a flat leaf from its root at the origin to its tip at +Y. */
export function featherGeometry(): BufferGeometry {
  return new ConeGeometry(0.32, 1, 4).translate(0, 0.5, 0).scale(1, 1, 0.1);
}
