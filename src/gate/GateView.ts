import { DoubleSide, Group, Mesh, MeshBasicMaterial, PlaneGeometry } from 'three';
import type { CanvasTexture } from 'three';
import { fromGate, OPENING, PICTURE } from './layout';
import type { GateLayout } from './layout';
import { placePicture } from './pictures';

const DIM = 0x7a5bd6; // the doorway's sheet with no place picked
const LIT = 0xfff3b8; // and with one picked
const FRAME = 0xffd23f; // round the picture that is picked
/** The picked place's picture, as it shows in the doorway. */
const SHOWN = 2.1; // m square

/**
 * Draws what changes about a gate: the pictures on its board, a frame round
 * the one that is picked, and the sheet in the doorway, which is dim until a
 * place is picked and then shows that place. The stone and wood are part of
 * the place's scenery; see scenery.ts.
 */
export class GateView {
  /** Add this to the scene. */
  readonly object = new Group();
  private layout: GateLayout | null = null;
  private readonly textures = new Map<string, CanvasTexture>();
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
      const map = placePicture(placeId);
      this.textures.set(placeId, map);
      flat(PICTURE, PICTURE, new MeshBasicMaterial({ map }), local[0], local[1], local[2] + 0.006);
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
    shown.map = picture ? (this.textures.get(picture.placeId) ?? null) : null;
    shown.needsUpdate = true;
    this.shown.visible = !!picture;
  }

  /** Free what was made for drawing. */
  private clear(): void {
    for (const child of this.object.children) {
      const mesh = child as Mesh;
      mesh.geometry.dispose();
      (mesh.material as MeshBasicMaterial).dispose();
    }
    this.object.clear();
    for (const texture of this.textures.values()) texture.dispose();
    this.textures.clear();
    this.frame = this.sheet = this.shown = null;
  }
}
