import { CanvasTexture, Group, Mesh, MeshBasicMaterial, PlaneGeometry, Quaternion, RingGeometry, SRGBColorSpace, Vector3 } from 'three';
import type { Pose } from '../player/Player';

// The player's own menu: a small board of big picture buttons that opens in
// front of them. To choose, a hand is held on a button while a ring fills,
// so nothing is chosen by a stray touch. There are no words on it: the
// players are small. What the buttons are is data, in buttons.ts.

/** A choice on the menu, shown as a picture. */
export interface MenuButton {
  id: string;
  /** Draw the picture on a square `size` pixels across. */
  draw(g: CanvasRenderingContext2D, size: number): void;
}

const BUTTON = 0.17; // m across one button
const GAP = 0.05; // m between buttons, and round the edge of the board
const AHEAD = 0.45; // m in front of the player
const BELOW = 0.32; // m below the eyes: at the chest, where a hand reaches without stretching
const TOUCH = 0.1; // m from a button's middle that a hand counts as on it
/** How long a hand must stay on a button to choose it. */
export const HOLD = 1.2; // s
const LET_GO = 0.4; // s for the ring to empty once the hand has gone
const PICTURE_PX = 256;
const UP = new Vector3(0, 1, 0);

export class Menu {
  /** Add this to the player's tracking space, so the board moves with them and not with their head. */
  readonly object = new Group();
  /** How full each button's ring is, 0 to 1. */
  private readonly held: number[];
  /** The middle of each button, on the board. */
  private readonly places: Vector3[];
  private readonly rings: Mesh[];
  private readonly ringMaterial = new MeshBasicMaterial({ color: 0x2fae4a, depthTest: false, transparent: true });
  private readonly v = new Vector3();
  private readonly q = new Quaternion();

  /** `onChoose` is told which button a hand was held on. The menu closes itself first. */
  constructor(
    private readonly buttons: readonly MenuButton[],
    private readonly onChoose: (id: string) => void,
  ) {
    const width = buttons.length * BUTTON + (buttons.length + 1) * GAP;
    const board = new Mesh(
      new PlaneGeometry(width, BUTTON + 2 * GAP),
      new MeshBasicMaterial({ color: 0xfff6dc, transparent: true, opacity: 0.9, depthTest: false }),
    );
    board.renderOrder = 10;
    this.object.add(board);

    this.held = buttons.map(() => 0);
    this.places = buttons.map((_, i) => new Vector3(-width / 2 + GAP + BUTTON / 2 + i * (BUTTON + GAP), 0, 0));
    this.rings = buttons.map((button, i) => {
      const face = new Mesh(new PlaneGeometry(BUTTON, BUTTON), new MeshBasicMaterial({ map: picture(button), color: 0xffffff, transparent: true, depthTest: false }));
      face.position.copy(this.places[i]);
      face.renderOrder = 11;
      const ring = new Mesh(new RingGeometry(0, 0, 3), this.ringMaterial);
      ring.position.copy(this.places[i]);
      ring.renderOrder = 12;
      ring.visible = false;
      this.object.add(face, ring);
      return ring;
    });
    this.object.visible = false;
  }

  get open(): boolean {
    return this.object.visible;
  }

  /**
   * Open the menu in front of the player, or close it. `head` is where the
   * player's head is in their tracking space.
   */
  toggle(head: Pose): void {
    if (this.open) return this.close();
    const forward = this.v.set(0, 0, -1).applyQuaternion(head.quaternion).setY(0);
    if (forward.lengthSq() < 1e-6) forward.set(0, 0, -1);
    forward.normalize();
    this.object.position.copy(head.position).addScaledVector(forward, AHEAD);
    this.object.position.y -= BELOW;
    // Upright, facing back toward the player.
    this.object.quaternion.setFromAxisAngle(UP, Math.atan2(-forward.x, -forward.z));
    this.object.visible = true;
  }

  close(): void {
    this.object.visible = false;
    this.held.fill(0);
    for (const ring of this.rings) ring.visible = false;
  }

  /** How full a button's ring is, 0 to 1. */
  progress(id: string): number {
    return this.held[this.buttons.findIndex((button) => button.id === id)] ?? 0;
  }

  /** Once per drawn frame. `hands` are where the player's hands are in their tracking space. */
  update(dt: number, hands: readonly Vector3[]): void {
    if (!this.open) return;
    const toBoard = this.q.copy(this.object.quaternion).invert();
    for (let i = 0; i < this.buttons.length; i++) {
      const touched = hands.some(
        (hand) => this.v.copy(hand).sub(this.object.position).applyQuaternion(toBoard).distanceTo(this.places[i]) < TOUCH,
      );
      const before = this.held[i];
      this.held[i] = Math.max(0, Math.min(1, before + (touched ? dt / HOLD : -dt / LET_GO)));
      if (this.held[i] >= 1) {
        const { id } = this.buttons[i];
        this.close();
        this.onChoose(id);
        return;
      }
      if (this.held[i] !== before) this.drawRing(i);
    }
  }

  /** The ring round a button, filled clockwise from the top as far as the hand has held. */
  private drawRing(i: number): void {
    const ring = this.rings[i];
    ring.visible = this.held[i] > 0;
    if (!ring.visible) return;
    ring.geometry.dispose();
    ring.geometry = new RingGeometry(BUTTON / 2 + 0.004, BUTTON / 2 + 0.022, 40, 1, Math.PI / 2, -Math.PI * 2 * this.held[i]);
  }
}

/** A button's picture as a texture, or none outside a browser, as in tests. */
function picture(button: MenuButton): CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = PICTURE_PX;
  button.draw(canvas.getContext('2d')!, PICTURE_PX);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}
