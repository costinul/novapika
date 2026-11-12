import {
  CanvasTexture,
  Color,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PlaneGeometry,
  SphereGeometry,
  SRGBColorSpace,
} from 'three';
import type { BufferGeometry } from 'three';
import { SEEDS_TO_HATCH } from '../../shared/api';
import type { EggView } from '../../shared/api';
import type { Stand } from '../world/types';
import { BOARD_PET_SIZE } from './PetCorner';
import type { PetCorner } from './PetCorner';
import { arrow, ARROW_COLOR } from './PetCornerView';
import { cross, heart, hourglass, noRoom, petStatue, picture, sign, tick } from './pictures';

// Draws the rest of the pet corner: the heart perches and the egg between
// them, the friends' board, a friend's request to answer, and the goodbye
// perch. Everything comes from the PetCorner; nothing is decided here.

const EGG_RADIUS = 0.085; // m across the middle
const EGG_HEIGHT = 0.115; // m, half its height
const CRACK = 0x3a2f2a;
const WOBBLE_FOR = 0.7; // s the egg rocks after a seed
const MAIL_PET_SIZE = 0.6;
const RING_BEADS = 16;
const RING_RADIUS = 0.2; // m
const PAD_IDLE = new Color(0xffb24d);
const PAD_HELD = new Color(0x6fdc6f);

const lifted = (stand: Stand, up: number): Stand => ({
  position: [stand.position[0], stand.position[1] + up, stand.position[2]],
  yaw: stand.yaw,
});

/**
 * An egg, painted from its shell colours with speckles, and with a crack
 * round it that grows with each seed it has been fed.
 */
function eggGeometry(egg: EggView): BufferGeometry {
  const geometry = new SphereGeometry(1, 12, 10).scale(EGG_RADIUS, EGG_HEIGHT, EGG_RADIUS).toNonIndexed();
  geometry.deleteAttribute('uv');
  const position = geometry.attributes.position;
  const colors = new Float32Array(position.count * 3);
  const color = new Color();
  // How far round the egg the crack has got: none, most of the way, then right round.
  const cracked = (egg.seeds / (SEEDS_TO_HATCH - 1)) * Math.PI * 2;
  for (let i = 0; i < position.count; i += 3) {
    const x = (position.getX(i) + position.getX(i + 1) + position.getX(i + 2)) / 3;
    const y = (position.getY(i) + position.getY(i + 1) + position.getY(i + 2)) / 3;
    const z = (position.getZ(i) + position.getZ(i + 1) + position.getZ(i + 2)) / 3;
    const round = Math.atan2(z, x) + Math.PI;
    // The crack zigzags about the middle of the egg.
    const zigzag = 0.018 * Math.sign(Math.sin(round * 6));
    const onCrack = round < cracked && Math.abs(y - zigzag) < 0.016;
    const speckled = (i / 3) % 7 === 3;
    color.set(onCrack ? CRACK : speckled ? egg.shell[1] : egg.shell[0]);
    for (let k = 0; k < 3; k++) color.toArray(colors, (i + k) * 3);
  }
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  return geometry;
}

export class StationsView {
  readonly object = new Group();
  /** Everything that changes with the account, redrawn together. */
  private readonly changing = new Group();
  private readonly eggMaterial = new MeshLambertMaterial({ vertexColors: true, flatShading: true });
  private readonly arrowMaterial = new MeshLambertMaterial({ color: ARROW_COLOR, flatShading: true });
  private readonly padMaterial = new MeshLambertMaterial({ color: PAD_IDLE.getHex() });
  private readonly textures = {
    hourglass: picture(hourglass),
    heart: picture(heart),
    tick: picture(tick),
    cross: picture(cross),
    noRoom: picture(noRoom),
  };
  private readonly name: { canvas: HTMLCanvasElement; texture: CanvasTexture; mesh: Mesh };
  private readonly friendArrows: Mesh[];
  private readonly pads: Mesh[];
  private readonly ring: InstancedMesh;
  private egg: Mesh | null = null;
  private waiting: Mesh | null = null;
  private wobble = 0;
  private time = 0;

  constructor(private readonly corner: PetCorner) {
    const { board, goodbye } = corner.def;

    // The plate over the friends' board, with the friend's name on it.
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 96;
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    const plate = new Mesh(new PlaneGeometry(1.0, 0.19), new MeshBasicMaterial({ map: texture, transparent: true }));
    plate.position.set(...board.name.position);
    plate.rotation.y = board.name.yaw + Math.PI;
    this.name = { canvas, texture, mesh: plate };
    this.friendArrows = [arrow(board.previous, -1, this.arrowMaterial), arrow(board.next, 1, this.arrowMaterial)];

    // The two pads held down to set a pet free, and the ring that fills as they are held.
    this.pads = goodbye.pads.map((stand) => {
      const pad = new Mesh(new CylinderGeometry(0.11, 0.11, 0.03, 16), this.padMaterial);
      pad.position.set(...stand.position);
      return pad;
    });
    this.ring = new InstancedMesh(new SphereGeometry(0.028, 8, 6), new MeshBasicMaterial({ color: 0x6fdc6f }), RING_BEADS);
    const [x, y, z] = goodbye.perch.position;
    const m = new Matrix4();
    for (let i = 0; i < RING_BEADS; i++) {
      // A ring standing upright across the way the pet faces, filling clockwise from the top.
      const a = (i / RING_BEADS) * Math.PI * 2;
      const side = Math.sin(a) * RING_RADIUS;
      this.ring.setMatrixAt(
        i,
        m.makeTranslation(
          x - Math.cos(goodbye.perch.yaw) * side,
          y + 0.16 + Math.cos(a) * RING_RADIUS,
          z + Math.sin(goodbye.perch.yaw) * side,
        ),
      );
    }
    this.ring.frustumCulled = false;

    this.object.add(this.changing, plate, ...this.friendArrows, ...this.pads, this.ring);
    this.rebuild();
  }

  /** Redraw after anything in the corner has changed. */
  rebuild(): void {
    const { corner } = this;
    const { def } = corner;
    this.clearChanging();
    this.egg = this.waiting = null;
    const add = (mesh: Mesh): Mesh => this.changing.add(mesh) && mesh;

    // The heart perches: the player's pet, or a see-through friend's pet with an hourglass.
    corner.heartSlots().forEach((slot, i) => {
      if (slot.kind === 'empty') return;
      add(petStatue(slot.pet, def.hearts[i], 1, slot.kind === 'theirs'));
      if (slot.kind === 'theirs') this.waiting = add(sign(this.textures.hourglass, lifted(def.hearts[i], 0.48), 0.16));
    });

    // The egg in its cup, or a picture saying there is no room for one.
    const [cx, cy, cz] = def.eggCup.position;
    const egg = corner.egg;
    if (egg) {
      this.egg = add(new Mesh(eggGeometry(egg), this.eggMaterial));
      this.egg.position.set(cx, cy + 0.03 + EGG_HEIGHT, cz);
    } else if (corner.player && corner.full) {
      add(sign(this.textures.noRoom, { position: [cx, cy + 0.45, cz], yaw: Math.atan2(cx, cz) }, 0.34));
    }

    // The friends' board.
    const showing = corner.friendShowing();
    showing?.pets.forEach((pet, place) => add(petStatue(pet, def.board.places[place], BOARD_PET_SIZE)));
    const pages = corner.friendPages().length;
    for (const mesh of this.friendArrows) mesh.visible = pages > 1;
    this.name.mesh.visible = !!showing;
    if (showing) this.writeName(showing.friend.nickname, Math.min(corner.friendPage, pages - 1), pages);

    // A friend's request: their pet and the pet asked for, a heart between, and yes and no.
    const mail = corner.mail;
    const mine = mail && corner.pet(mail.myPetId);
    if (mail && mine) {
      add(petStatue(mail.theirPet, def.mail.theirs, MAIL_PET_SIZE));
      add(petStatue(mine, def.mail.mine, MAIL_PET_SIZE));
      const [ax, ay, az] = def.mail.theirs.position;
      const [bx, , bz] = def.mail.mine.position;
      add(sign(this.textures.heart, { position: [(ax + bx) / 2, ay + 0.3, (az + bz) / 2], yaw: def.mail.mine.yaw }, 0.14));
      add(sign(this.textures.tick, def.mail.yes, 0.2));
      add(sign(this.textures.cross, def.mail.no, 0.2));
    }

    // The goodbye perch.
    const leaving = corner.pet(corner.placed.goodbye);
    if (leaving) add(petStatue(leaving, def.goodbye.perch));
    for (const pad of this.pads) pad.visible = !!leaving;
  }

  /** The egg was fed: rock it. */
  rock(): void {
    this.wobble = WOBBLE_FOR;
  }

  update(dt: number): void {
    this.time += dt;
    this.wobble = Math.max(0, this.wobble - dt);
    if (this.egg) this.egg.rotation.z = 0.3 * (this.wobble / WOBBLE_FOR) * Math.sin(this.wobble * 30);
    if (this.waiting) this.waiting.rotation.z = 0.25 * Math.sin(this.time * 2);
    this.friendArrows.forEach((mesh, i) => mesh.scale.setScalar(1 + 0.08 * Math.sin(this.time * 4 + i)));

    const { corner } = this;
    const leaving = !!corner.placed.goodbye;
    this.ring.visible = leaving && corner.held > 0;
    this.ring.count = Math.round(corner.held * RING_BEADS);
    this.padMaterial.color.copy(corner.held > 0 ? PAD_HELD : PAD_IDLE);
  }

  /** The friend's name, and a dot for each page of the board with the one showing filled in. */
  private writeName(name: string, page: number, pages: number): void {
    const { canvas, texture } = this.name;
    const g = canvas.getContext('2d')!;
    g.clearRect(0, 0, canvas.width, canvas.height);
    g.fillStyle = '#fff6dc';
    g.beginPath();
    g.roundRect(4, 4, canvas.width - 8, canvas.height - 8, 28);
    g.fill();
    g.fillStyle = '#3a2f2a';
    g.font = '700 50px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(name, canvas.width / 2, pages > 1 ? 40 : 50, canvas.width - 60);
    if (pages > 1) {
      for (let i = 0; i < pages; i++) {
        g.fillStyle = i === page ? '#ff7a1a' : '#d9c9a8';
        g.beginPath();
        g.arc(canvas.width / 2 + (i - (pages - 1) / 2) * 22, 78, 6, 0, Math.PI * 2);
        g.fill();
      }
    }
    texture.needsUpdate = true;
  }

  /** Throw away what the last redraw made. Models share their materials; pictures each have their own. */
  private clearChanging(): void {
    for (const child of this.changing.children) {
      const mesh = child as Mesh;
      mesh.geometry.dispose();
      if (mesh.material instanceof MeshBasicMaterial) mesh.material.dispose();
    }
    this.changing.clear();
  }

  /** Free what was made for drawing. Call when the lobby is unloaded. */
  dispose(): void {
    this.clearChanging();
    for (const mesh of [...this.friendArrows, ...this.pads, this.name.mesh, this.ring]) mesh.geometry.dispose();
    for (const texture of [...Object.values(this.textures), this.name.texture]) texture.dispose();
    for (const material of [this.eggMaterial, this.arrowMaterial, this.padMaterial]) material.dispose();
    (this.ring.material as MeshBasicMaterial).dispose();
    (this.name.mesh.material as MeshBasicMaterial).dispose();
  }
}
