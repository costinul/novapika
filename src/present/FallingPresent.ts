import {
  BoxGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshLambertMaterial,
  Quaternion,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  Vector3,
} from 'three';
import type { BufferGeometry } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Present } from '../../shared/net';

// A present the owner has let go from the sky: a wrapped box under a little
// parachute, with a pet inside. It comes down slowly to its landing place and
// waits there. The first player to touch it, with a hand or the beak, gets
// the pet; that is the lobby's to say, so a touch only asks.

/** How high above its landing place a present is let go. */
export const FALL_FROM = 24; // m
/** How fast it comes down. */
export const FALL_SPEED = 1.2; // m/s
/** A hand or a beak this near the middle of the box touches it. */
export const TOUCH_WITHIN = 0.45; // m
/** Each side of the box. */
const SIZE = 0.4; // m
/** While a touch lasts, how often the lobby is asked for the pet. */
const ASK_EVERY = 1; // s
/** After the lobby has said no, how long before a touch asks again. */
const ASK_AGAIN = 3; // s
/** How far it drifts to each side on the way down. */
const SWAY = 0.8; // m
const CANOPY = 0.55; // m, the parachute's radius
const STRINGS = 0.75; // m from the top of the box up to the parachute's rim

/** A shape painted one colour, ready to be joined with others. */
function painted(geometry: BufferGeometry, hex: number): BufferGeometry {
  const flat = geometry.index ? geometry.toNonIndexed() : geometry;
  if (flat !== geometry) geometry.dispose();
  const color = new Color(hex);
  const colors = new Float32Array(flat.attributes.position.count * 3);
  for (let i = 0; i < colors.length; i += 3) color.toArray(colors, i);
  flat.setAttribute('color', new Float32BufferAttribute(colors, 3));
  return flat;
}

function join(parts: BufferGeometry[]): BufferGeometry {
  const joined = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  return joined;
}

/** The box: pink paper, a yellow ribbon both ways round and a bow on top. Its middle is the origin. */
function boxShape(): BufferGeometry {
  const band = SIZE * 1.02;
  return join([
    painted(new BoxGeometry(SIZE, SIZE, SIZE), 0xff5fa2),
    painted(new BoxGeometry(SIZE * 0.2, band, band), 0xffd84a),
    painted(new BoxGeometry(band, band, SIZE * 0.2), 0xffd84a),
    painted(new SphereGeometry(SIZE * 0.14, 8, 6).scale(1.5, 0.8, 0.8).translate(-SIZE * 0.17, SIZE * 0.56, 0), 0xffd84a),
    painted(new SphereGeometry(SIZE * 0.14, 8, 6).scale(1.5, 0.8, 0.8).translate(SIZE * 0.17, SIZE * 0.56, 0), 0xffd84a),
  ]);
}

/** The parachute and its strings, above a box whose middle is the origin. */
function parachuteShape(): BufferGeometry {
  const rim = SIZE / 2 + STRINGS;
  const parts: BufferGeometry[] = [];
  // The canopy: the top third of a ball, in stripes of two colours.
  const stripes = 8;
  for (let i = 0; i < stripes; i++) {
    const slice = new SphereGeometry(CANOPY, 2, 4, (i / stripes) * Math.PI * 2, (Math.PI * 2) / stripes, 0, Math.PI * 0.42);
    // The ball's rim sits at `rim`; its top is above that.
    parts.push(painted(slice.translate(0, rim - CANOPY * Math.cos(Math.PI * 0.42), 0), i % 2 ? 0xffffff : 0x4fd6cf));
  }
  const edge = CANOPY * Math.sin(Math.PI * 0.42);
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const top = new Vector3(Math.cos(angle) * edge, rim, Math.sin(angle) * edge);
    const foot = new Vector3(Math.cos(angle) * SIZE * 0.45, SIZE / 2, Math.sin(angle) * SIZE * 0.45);
    const string = new CylinderGeometry(0.006, 0.006, top.distanceTo(foot), 4);
    string.translate(0, top.distanceTo(foot) / 2, 0);
    // Stand the string on its foot and lean it to its top.
    const lean = top.clone().sub(foot).normalize();
    string.applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), lean));
    parts.push(painted(string.translate(foot.x, foot.y, foot.z), 0xf3ead2));
  }
  return join(parts);
}

/** A soft golden light round the box, so that it can be found from across the lobby. */
function glow(): Sprite | null {
  // Nothing to draw it with outside a browser, as in tests.
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const g = canvas.getContext('2d')!;
  const fade = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  fade.addColorStop(0, 'rgba(255, 244, 170, 0.9)');
  fade.addColorStop(0.4, 'rgba(255, 226, 110, 0.45)');
  fade.addColorStop(1, 'rgba(255, 216, 74, 0)');
  g.fillStyle = fade;
  g.fillRect(0, 0, 64, 64);
  const sprite = new Sprite(new SpriteMaterial({ map: new CanvasTexture(canvas), transparent: true, depthWrite: false }));
  sprite.scale.setScalar(SIZE * 5);
  return sprite;
}

export class FallingPresent {
  /** Add this to the scene. */
  readonly object = new Group();
  /** The middle of the box. */
  readonly position = new Vector3();
  /** The present that is here, or null. */
  id: string | null = null;
  /** Seconds since it was let go. */
  private age = 0;
  private readonly landing = new Vector3();
  /** Seconds until a touch next asks the lobby. */
  private askIn = 0;
  private readonly parachute: Mesh;
  private readonly light: Sprite | null;

  constructor() {
    const material = new MeshLambertMaterial({ vertexColors: true, flatShading: true, side: DoubleSide });
    this.parachute = new Mesh(parachuteShape(), material);
    this.light = glow();
    this.object.add(new Mesh(boxShape(), material), this.parachute);
    if (this.light) this.object.add(this.light);
    this.object.visible = false;
  }

  /** True once it has come to rest. */
  get landed(): boolean {
    return this.age * FALL_SPEED >= FALL_FROM;
  }

  /**
   * A present is on its way down, to come to rest at `landing`, where the
   * underside of the box goes; or with null, there is none any more.
   */
  show(present: Present | null, landing?: Vector3): void {
    this.id = present?.id ?? null;
    this.object.visible = present !== null;
    if (!present) return;
    this.age = present.age / 1000;
    this.askIn = 0;
    if (landing) this.landing.copy(landing);
    this.place();
  }

  /** The lobby would not give the player the pet: a touch does not ask again for a moment. */
  refused(): void {
    this.askIn = ASK_AGAIN;
  }

  /**
   * Once per drawn frame. `points` are what the player touches with: the
   * beak and the hands. Gives the id of the present when the lobby should be
   * asked for it, and otherwise null.
   */
  frame(dt: number, points: readonly Vector3[]): string | null {
    if (!this.id) return null;
    this.age += dt;
    this.askIn = Math.max(0, this.askIn - dt);
    this.place();
    if (this.askIn > 0 || !points.some((point) => point.distanceTo(this.position) < TOUCH_WITHIN)) return null;
    this.askIn = ASK_EVERY;
    return this.id;
  }

  /** Put the box where it is now: swaying down under its parachute, or bobbing where it landed. */
  private place(): void {
    const up = Math.max(0, FALL_FROM - this.age * FALL_SPEED);
    // The sway dies away over the last few metres, so that it lands on its spot.
    const drift = SWAY * Math.min(1, up / 3);
    this.position.set(
      this.landing.x + Math.sin(this.age * 0.5) * drift,
      this.landing.y + SIZE / 2 + up + (up > 0 ? 0 : 0.06 + 0.05 * Math.sin(this.age * 2.5)),
      this.landing.z + Math.cos(this.age * 0.37) * drift * 0.6,
    );
    this.object.position.copy(this.position);
    this.object.rotation.set(0, this.age * 0.5, up > 0 ? 0.08 * Math.sin(this.age * 0.9) : 0);
    this.parachute.visible = up > 0;
    if (this.light) this.light.material.opacity = 0.75 + 0.25 * Math.sin(this.age * 4);
  }
}
