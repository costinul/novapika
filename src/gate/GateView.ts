import { CanvasTexture, DoubleSide, Group, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace } from 'three';
import { LOBBY_SIZE } from '../../shared/net';
import { fromGate, OPENING, PICTURE } from './layout';
import type { GateLayout } from './layout';
import { placePicture } from './pictures';

const DIM = 0x7a5bd6; // the doorway's sheet with no place picked
const LIT = 0xfff3b8; // and with one picked
const FRAME = 0xffd23f; // round the picture that is picked
const FULL = 0x6b6b6b; // a full place's picture is greyed with this
/** The picked place's picture, as it shows in the doorway. */
const SHOWN = 2.1; // m square
/** The row of little parrots over a picture, as wide as the picture: one for each player in that place. */
const ROW_HEIGHT = PICTURE / LOBBY_SIZE; // m
const ROW_PX = 32; // px, one parrot

/** A row of `count` little parrot heads. */
function drawRow(canvas: HTMLCanvasElement, count: number): void {
  const g = canvas.getContext('2d')!;
  g.clearRect(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < count; i++) {
    const x = (i + 0.5) * ROW_PX;
    const y = ROW_PX / 2;
    g.fillStyle = '#ffd23f';
    g.beginPath();
    g.arc(x, y, 12, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#f08a24';
    g.beginPath();
    g.moveTo(x - 5, y + 2);
    g.lineTo(x + 5, y + 2);
    g.lineTo(x, y + 11);
    g.fill();
    g.fillStyle = '#3a2f2a';
    for (const side of [-1, 1]) {
      g.beginPath();
      g.arc(x + side * 5, y - 3, 2.2, 0, Math.PI * 2);
      g.fill();
    }
  }
}

/**
 * Draws what changes about a gate: the pictures on its board, a frame round
 * the one that is picked, how many players are in each place, and the sheet
 * in the doorway, which is dim until a place is picked and then shows that
 * place. The stone and wood are part of the place's scenery; see scenery.ts.
 */
export class GateView {
  /** Add this to the scene. */
  readonly object = new Group();
  private layout: GateLayout | null = null;
  private readonly pictures = new Map<string, MeshBasicMaterial>();
  private readonly rows = new Map<string, { mesh: Mesh; canvas: HTMLCanvasElement; texture: CanvasTexture }>();
  private frame: Mesh | null = null;
  private sheet: Mesh | null = null;
  private shown: Mesh | null = null;

  /** Draw the gate of the place that has just loaded, or nothing if it has none. */
  rebuild(layout: GateLayout | null): void {
    this.clear();
    this.layout = layout;
    if (!layout) return;
    const { def } = layout;

    /** A flat sheet facing out of the doorway, with its middle at a point in the gate's own frame. */
    const flat = (width: number, height: number, material: MeshBasicMaterial, x: number, y: number, z: number): Mesh => {
      const mesh = new Mesh(new PlaneGeometry(width, height), material);
      mesh.position.set(...fromGate(def, x, y, z));
      mesh.rotation.y = def.yaw;
      this.object.add(mesh);
      return mesh;
    };

    for (const { placeId, local } of layout.pictures) {
      const [x, y, z] = local;
      const picture = new MeshBasicMaterial({ map: placePicture(placeId) });
      this.pictures.set(placeId, picture);
      flat(PICTURE, PICTURE, picture, x, y, z + 0.006);

      // Above it, room for one little parrot for each player a place holds. Empty until the server says.
      const canvas = document.createElement('canvas');
      canvas.width = ROW_PX * LOBBY_SIZE;
      canvas.height = ROW_PX;
      const texture = new CanvasTexture(canvas);
      texture.colorSpace = SRGBColorSpace;
      const row = new MeshBasicMaterial({ map: texture, transparent: true });
      const mesh = flat(PICTURE, ROW_HEIGHT, row, x, y + PICTURE / 2 + 0.06, z + 0.006);
      mesh.visible = false;
      this.rows.set(placeId, { mesh, canvas, texture });
    }
    this.frame = flat(PICTURE + 0.09, PICTURE + 0.09, new MeshBasicMaterial({ color: FRAME }), 0, 0, 0);
    this.frame.visible = false;

    const middle = (OPENING.bottom + OPENING.top) / 2;
    this.sheet = flat(
      2 * OPENING.halfWidth,
      OPENING.top - OPENING.bottom,
      new MeshBasicMaterial({ color: DIM, transparent: true, opacity: 0.5, side: DoubleSide, depthWrite: false }),
      0,
      middle,
      OPENING.z,
    );
    this.shown = flat(SHOWN, SHOWN, new MeshBasicMaterial({ transparent: true }), 0, middle, OPENING.z + 0.02);
    this.shown.visible = false;
  }

  /** Show which place is picked, or that none is. */
  setPicked(placeId: string | null): void {
    const picture = this.layout?.pictures.find((p) => p.placeId === placeId);
    if (!this.layout || !this.frame || !this.sheet || !this.shown) return;

    this.frame.visible = !!picture;
    if (picture) {
      const [x, y, z] = picture.local;
      this.frame.position.set(...fromGate(this.layout.def, x, y, z + 0.003));
    }
    const sheet = this.sheet.material as MeshBasicMaterial;
    sheet.color.set(picture ? LIT : DIM);
    sheet.opacity = picture ? 0.9 : 0.5;
    const shown = this.shown.material as MeshBasicMaterial;
    shown.map = picture ? (this.pictures.get(picture.placeId)?.map ?? null) : null;
    shown.needsUpdate = true;
    this.shown.visible = !!picture;
  }

  /**
   * Show how many players are in each place, by lobby id: a row of little
   * parrots over its picture, and the picture greyed when the place is full.
   * With null, nothing is known and nothing is shown.
   */
  setCounts(counts: Readonly<Record<string, number>> | null): void {
    for (const [placeId, row] of this.rows) {
      const count = Math.min(LOBBY_SIZE, counts?.[placeId] ?? 0);
      drawRow(row.canvas, count);
      row.texture.needsUpdate = true;
      row.mesh.visible = count > 0;
      this.pictures.get(placeId)?.color.set(count >= LOBBY_SIZE ? FULL : 0xffffff);
    }
  }

  /** Free what was made for drawing. */
  private clear(): void {
    for (const child of this.object.children) {
      const mesh = child as Mesh;
      const material = mesh.material as MeshBasicMaterial;
      mesh.geometry.dispose();
      // The doorway shows one of the board's own pictures: freeing it twice does no harm.
      material.map?.dispose();
      material.dispose();
    }
    this.object.clear();
    this.pictures.clear();
    this.rows.clear();
    this.frame = this.sheet = this.shown = null;
  }
}
