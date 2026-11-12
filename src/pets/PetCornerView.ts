import {
  Color,
  ConeGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  SRGBColorSpace,
} from 'three';
import type { BufferGeometry, CanvasTexture } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { tierOf } from '../../shared/dna';
import type { Tier } from '../../shared/dna';
import type { Stand } from '../world/types';
import type { PetCorner } from './PetCorner';
import { noConnection, padlock, petStatue, picture, sign } from './pictures';

// Draws the pet rail: a model of each pet on the page, a coloured sleeve on
// the rail under it for its tier, arrows to turn the page, and a picture when
// there are no pets to show.

/**
 * The colour of each tier. A mythical's sleeve is a rainbow instead, an ultra
 * mythical's a rainbow striped with white, and a god mythical's white striped with gold.
 */
const TIER_COLOR: Record<Exclude<Tier, 'mythical' | 'ultra' | 'god'>, number> = {
  common: 0x8a949c,
  uncommon: 0x3fae54,
  rare: 0x3b82d6,
  epic: 0x8b5cf6,
  legendary: 0xf2b632,
};
const SLEEVE_LENGTH = 0.34; // m along the rail
const SLEEVE_RADIUS = 0.045; // m, a little fatter than the rail
const RAIL_RADIUS = 0.03; // m, the perch position is the top of the rail
export const ARROW_COLOR = 0xff7a1a;
const SHAKE_FOR = 0.5; // s a perch shakes when the server says no
const SIGN_SIZE = 0.5; // m

/** A sleeve round the rail, lying along X, painted for a tier. */
function sleeve(tier: Tier): BufferGeometry {
  const geometry = new CylinderGeometry(SLEEVE_RADIUS, SLEEVE_RADIUS, SLEEVE_LENGTH, 8, 6).rotateZ(Math.PI / 2).toNonIndexed();
  geometry.deleteAttribute('uv');
  const position = geometry.attributes.position;
  const colors = new Float32Array(position.count * 3);
  const color = new Color();
  for (let i = 0; i < position.count; i += 3) {
    // One colour for each triangle, by where its middle is along the rail.
    const along = (position.getX(i) + position.getX(i + 1) + position.getX(i + 2)) / 3 / SLEEVE_LENGTH + 0.5;
    const span = Math.min(0.999, Math.max(0, along));
    if (tier === 'god') color.set(Math.floor(span * 7) % 2 === 1 ? 0xf2b632 : 0xffffff);
    else if (tier === 'ultra' && Math.floor(span * 7) % 2 === 1) color.set(0xffffff);
    else if (tier === 'mythical' || tier === 'ultra') color.setHSL(span * 0.85, 0.95, 0.56, SRGBColorSpace);
    else color.set(TIER_COLOR[tier]);
    for (let k = 0; k < 3; k++) color.toArray(colors, (i + k) * 3);
  }
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  return geometry;
}

/**
 * A flat arrowhead to touch, pointing left (-1) or right (1) as seen from
 * the middle of the nest.
 */
export function arrow(stand: Stand, points: -1 | 1, material: MeshLambertMaterial): Mesh {
  // Turned to face the middle of the nest, a model's own +X is to the viewer's left.
  const mesh = new Mesh(new ConeGeometry(0.11, 0.2, 3).scale(1, 1, 0.35).rotateZ((points * Math.PI) / 2), material);
  mesh.position.set(...stand.position);
  mesh.rotation.y = stand.yaw;
  return mesh;
}

export class PetCornerView {
  readonly object = new Group();
  /** Everything that changes with the page, redrawn together. */
  private readonly page = new Group();
  private readonly sleeveMaterial = new MeshLambertMaterial({ vertexColors: true, flatShading: true });
  private readonly arrowMaterial = new MeshLambertMaterial({ color: ARROW_COLOR, flatShading: true });
  private readonly statues: (Mesh | null)[] = [];
  private readonly arrows: Mesh[];
  private readonly sign: Mesh;
  private readonly pictures: { out: CanvasTexture; offline: CanvasTexture };
  private readonly shaking: number[];
  private time = 0;

  constructor(private readonly corner: PetCorner) {
    const { def } = corner;
    this.shaking = def.perches.map(() => 0);
    this.arrows = [arrow(def.previous, -1, this.arrowMaterial), arrow(def.next, 1, this.arrowMaterial)];
    this.pictures = { out: picture(padlock), offline: picture(noConnection) };
    this.sign = sign(this.pictures.out, def.sign, SIGN_SIZE);
    this.object.add(this.page, ...this.arrows, this.sign);
    this.rebuild();
  }

  /** Redraw after the account, the page, or which pets are away has changed. */
  rebuild(): void {
    const { corner } = this;
    for (const child of this.page.children) (child as Mesh).geometry.dispose();
    this.page.clear();

    const sleeves: BufferGeometry[] = [];
    corner.slots().forEach((pet, slot) => {
      this.statues[slot] = null;
      if (!pet) return;
      const stand = corner.def.perches[slot];
      const statue = petStatue(pet, stand);
      this.page.add(statue);
      this.statues[slot] = statue;

      const [x, y, z] = stand.position;
      sleeves.push(sleeve(tierOf(pet.dna)).rotateY(stand.yaw).translate(x, y - RAIL_RADIUS, z));
    });
    if (sleeves.length > 0) {
      this.page.add(new Mesh(mergeGeometries(sleeves), this.sleeveMaterial));
      for (const part of sleeves) part.dispose();
    }

    for (const mesh of this.arrows) mesh.visible = corner.pages > 1;
    const { status } = corner.account;
    this.sign.visible = status !== 'in';
    if (status !== 'in') (this.sign.material as MeshBasicMaterial).map = this.pictures[status];
  }

  /** The server said no: shake the pet on this perch. */
  shake(slot: number): void {
    this.shaking[slot] = SHAKE_FOR;
  }

  update(dt: number): void {
    this.time += dt;
    this.statues.forEach((statue, slot) => {
      if (!statue) return;
      const left = (this.shaking[slot] = Math.max(0, this.shaking[slot] - dt));
      statue.rotation.z = left > 0 ? 0.35 * (left / SHAKE_FOR) * Math.sin(left * 45) : 0;
    });
    // The arrows nod a little, so they read as something to touch.
    this.arrows.forEach((mesh, i) => mesh.scale.setScalar(1 + 0.08 * Math.sin(this.time * 4 + i)));
  }

  /** Free what was made for drawing. Call when the lobby is unloaded. */
  dispose(): void {
    for (const child of this.page.children) (child as Mesh).geometry.dispose();
    for (const mesh of this.arrows) mesh.geometry.dispose();
    this.arrowMaterial.dispose();
    this.sleeveMaterial.dispose();
    this.sign.geometry.dispose();
    (this.sign.material as MeshBasicMaterial).dispose();
    this.pictures.out.dispose();
    this.pictures.offline.dispose();
  }
}
