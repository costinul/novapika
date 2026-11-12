import {
  CanvasTexture,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PlaneGeometry,
  SRGBColorSpace,
} from 'three';
import type { BufferGeometry } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { tierOf } from '../../shared/dna';
import type { Tier } from '../../shared/dna';
import { buildStatue } from '../characters/parrotGeometry';
import { parrotAura, parrotMaterial } from '../characters/parrotMaterial';
import { petCharacter } from '../characters/pets';
import { PARROT_HEIGHT } from '../player/PlayerView';
import type { Stand } from '../world/types';
import type { PetCorner } from './PetCorner';

// Draws the pet corner: a model of each pet on the page, a coloured sleeve on
// the rail under it for its tier, arrows to turn the page, and a picture when
// there are no pets to show.

/** The colour of each tier. A mythical's sleeve is a rainbow instead. */
const TIER_COLOR: Record<Exclude<Tier, 'mythical'>, number> = {
  common: 0x8a949c,
  uncommon: 0x3fae54,
  rare: 0x3b82d6,
  epic: 0x8b5cf6,
  legendary: 0xf2b632,
};
const SLEEVE_LENGTH = 0.34; // m along the rail
const SLEEVE_RADIUS = 0.045; // m, a little fatter than the rail
const RAIL_RADIUS = 0.03; // m, the perch position is the top of the rail
const ARROW = 0xff7a1a;
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
    if (tier === 'mythical') color.setHSL(Math.min(0.999, Math.max(0, along)) * 0.85, 0.95, 0.56, SRGBColorSpace);
    else color.set(TIER_COLOR[tier]);
    for (let k = 0; k < 3; k++) color.toArray(colors, (i + k) * 3);
  }
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  return geometry;
}

type Draw = (g: CanvasRenderingContext2D) => void;

/** A padlock: nobody is signed in. */
const padlock: Draw = (g) => {
  g.strokeStyle = '#39424e';
  g.lineWidth = 22;
  g.lineCap = 'round';
  g.beginPath();
  g.arc(128, 104, 46, Math.PI, 0);
  g.lineTo(174, 128);
  g.moveTo(82, 104);
  g.lineTo(82, 128);
  g.stroke();
  g.fillStyle = '#f2c14e';
  g.beginPath();
  g.roundRect(56, 122, 144, 104, 22);
  g.fill();
  g.fillStyle = '#39424e';
  g.beginPath();
  g.arc(128, 164, 15, 0, Math.PI * 2);
  g.fill();
  g.fillRect(120, 164, 16, 34);
};

/** A cloud with a line through it: the server cannot be reached. */
const noConnection: Draw = (g) => {
  g.fillStyle = '#ffffff';
  g.strokeStyle = '#39424e';
  g.lineWidth = 14;
  g.lineJoin = 'round';
  g.beginPath();
  g.arc(92, 150, 42, Math.PI * 0.5, Math.PI * 1.5);
  g.arc(132, 108, 50, Math.PI * 1.1, Math.PI * 1.9);
  g.arc(176, 150, 42, Math.PI * 1.5, Math.PI * 0.5);
  g.closePath();
  g.fill();
  g.stroke();
  g.strokeStyle = '#e0352b';
  g.lineWidth = 20;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(56, 222);
  g.lineTo(204, 50);
  g.stroke();
};

function picture(draw: Draw): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  draw(canvas.getContext('2d')!);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

export class PetCornerView {
  readonly object = new Group();
  /** Everything that changes with the page, redrawn together. */
  private readonly page = new Group();
  private readonly sleeveMaterial = new MeshLambertMaterial({ vertexColors: true, flatShading: true });
  private readonly arrowMaterial = new MeshLambertMaterial({ color: ARROW, flatShading: true });
  private readonly statues: (Mesh | null)[] = [];
  private readonly arrows: Mesh[];
  private readonly sign: Mesh;
  private readonly pictures: { out: CanvasTexture; offline: CanvasTexture };
  private readonly shaking: number[];
  private time = 0;

  constructor(private readonly corner: PetCorner) {
    const { def } = corner;
    this.shaking = def.perches.map(() => 0);

    // A flat arrowhead pointing along the rail, away from the pets.
    const arrow = (stand: Stand, turn: number): Mesh => {
      const mesh = new Mesh(new ConeGeometry(0.11, 0.2, 3).scale(1, 1, 0.35).rotateZ(turn), this.arrowMaterial);
      mesh.position.set(...stand.position);
      mesh.rotation.y = stand.yaw;
      return mesh;
    };
    // Turned to face the middle of the nest, a model's own +X is to the viewer's left.
    this.arrows = [arrow(def.previous, -Math.PI / 2), arrow(def.next, Math.PI / 2)];

    this.pictures = { out: picture(padlock), offline: picture(noConnection) };
    this.sign = new Mesh(
      new PlaneGeometry(SIGN_SIZE, SIGN_SIZE),
      new MeshBasicMaterial({ map: this.pictures.out, transparent: true }),
    );
    this.sign.position.set(...def.sign.position);
    this.sign.rotation.y = def.sign.yaw + Math.PI;

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
      const who = petCharacter(pet.id, pet.dna);
      const statue = new Mesh(buildStatue(who), parrotMaterial(who));
      statue.position.set(...stand.position);
      statue.rotation.y = stand.yaw;
      statue.scale.setScalar(PARROT_HEIGHT * who.scale);
      const aura = parrotAura(who);
      if (aura) statue.add(aura);
      this.page.add(statue);
      this.statues[slot] = statue;

      const [x, y, z] = stand.position;
      sleeves.push(sleeve(tierOf(pet.dna)).rotateY(stand.yaw).translate(x, y - RAIL_RADIUS, z));
    });
    if (sleeves.length > 0) {
      this.page.add(new Mesh(mergeGeometries(sleeves), this.sleeveMaterial));
      for (const part of sleeves) part.dispose();
    }

    for (const arrow of this.arrows) arrow.visible = corner.pages > 1;
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
    this.arrows.forEach((arrow, i) => (arrow.scale.setScalar(1 + 0.08 * Math.sin(this.time * 4 + i))));
  }

  /** Free what was made for drawing. Call when the lobby is unloaded. */
  dispose(): void {
    for (const child of this.page.children) (child as Mesh).geometry.dispose();
    for (const arrow of this.arrows) arrow.geometry.dispose();
    this.arrowMaterial.dispose();
    this.sleeveMaterial.dispose();
    this.sign.geometry.dispose();
    (this.sign.material as MeshBasicMaterial).dispose();
    this.pictures.out.dispose();
    this.pictures.offline.dispose();
  }
}
