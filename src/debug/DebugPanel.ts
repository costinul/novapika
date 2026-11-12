import {
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  Raycaster,
  SRGBColorSpace,
  Vector3,
} from 'three';
import { nudge } from '../config/movement';
import type { Tunable } from '../config/movement';
import type { Pose } from '../player/Player';

export interface PanelStatus {
  fps: number;
  movementState: string;
  lobbyId: string;
  /** One more line of whatever the grown-up should see, such as what the helper parrot's ear is doing. */
  note: string;
  drawCalls: number;
  triangles: number;
}

/** Something that can point at the panel and click: a hand, or the mouse. */
export interface PanelPointer {
  origin: Vector3;
  direction: Vector3;
  pressed: boolean;
}

const WIDTH_PX = 1024;
const ROW_PX = 56;
const HEADER_ROWS = 4;
const ROWS_PER_PAGE = 12;
/** Row number used for the previous/next page buttons in the header. */
const PAGE_ROW = -1;
const WIDTH_M = 0.7;
const MINUS_X = [744, 864] as const;
const PLUS_X = [884, 1004] as const;
const REPEAT_DELAY = 0.4; // s held before a button starts repeating
const REPEAT_INTERVAL = 0.08; // s between repeats
const STATUS_INTERVAL = 0.25; // s between fps/state redraws

interface Hit {
  /** Index into the config entries, or PAGE_ROW for the page buttons. */
  row: number;
  direction: 1 | -1;
}

/**
 * In-headset panel that shows frame rate and movement state and lets every
 * value in the movement config be changed live. Point a controller at a
 * - or + button and pull the trigger (or click with the mouse on desktop).
 */
export class DebugPanel {
  /** Add this to the scene. It stays at the origin; the board moves inside it. */
  readonly object = new Group();

  private readonly entries: [string, Tunable][];
  private readonly canvas = document.createElement('canvas');
  private readonly g = this.canvas.getContext('2d')!;
  private readonly texture = new CanvasTexture(this.canvas);
  private readonly board: Mesh;
  private readonly lasers: Line[] = [];
  private readonly cursors: Mesh[] = [];
  private readonly raycaster = new Raycaster();
  private readonly held: { hit: Hit | null; time: number; wasPressed: boolean }[] = [];
  private hovered: Hit | null = null;
  /** A pointer is aimed at the panel, so its trigger belongs to the panel. */
  pointerOnPanel = false;
  private page = 0;
  private readonly pageCount: number;
  private statusTimer = 0;

  constructor(
    config: Record<string, Tunable>,
    private readonly getStatus: () => PanelStatus,
  ) {
    this.entries = Object.entries(config);
    this.canvas.width = WIDTH_PX;
    this.pageCount = Math.max(1, Math.ceil(this.entries.length / ROWS_PER_PAGE));
    this.canvas.height = (HEADER_ROWS + ROWS_PER_PAGE) * ROW_PX;
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.anisotropy = 8;

    const heightM = (WIDTH_M * this.canvas.height) / WIDTH_PX;
    this.board = new Mesh(
      new PlaneGeometry(WIDTH_M, heightM),
      new MeshBasicMaterial({ map: this.texture }),
    );
    this.object.add(this.board);
    this.raycaster.far = 5;
    this.draw();
  }

  get visible(): boolean {
    return this.object.visible;
  }

  /** Show the panel in front of a head pose, or hide it if it is showing. */
  toggle(head: Pose): void {
    if (this.object.visible) {
      this.object.visible = false;
    } else {
      this.placeInFrontOf(head);
    }
  }

  /** `yaw` turns the spot away from straight ahead; negative is to the right. */
  placeInFrontOf(head: Pose, yaw = 0): void {
    const forward = new Vector3(0, 0, -1).applyQuaternion(head.quaternion);
    forward.y = 0;
    if (forward.lengthSq() < 1e-6) forward.set(0, 0, -1);
    forward.normalize().applyAxisAngle(new Vector3(0, 1, 0), yaw);
    this.board.position.copy(head.position).addScaledVector(forward, 0.9);
    this.board.position.y = head.position.y;
    // Face back toward the player, upright.
    this.board.quaternion.copy(
      new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), forward.negate()),
    );
    this.object.visible = true;
  }

  update(dt: number, pointers: readonly PanelPointer[]): void {
    this.pointerOnPanel = false;
    if (!this.object.visible) return;
    this.board.updateMatrixWorld();

    let hovered: Hit | null = null;
    let changed = false;

    pointers.forEach((p, i) => {
      const state = (this.held[i] ??= { hit: null, time: 0, wasPressed: false });
      this.raycaster.set(p.origin, p.direction);
      const hit = this.raycaster.intersectObject(this.board, false)[0];
      this.showPointer(i, p.origin, hit?.point);
      if (hit) this.pointerOnPanel = true;

      const target = hit?.uv ? this.hitAt(hit.uv.x, hit.uv.y) : null;
      if (target) hovered = target;

      if (p.pressed && !state.wasPressed) {
        state.hit = target;
        state.time = 0;
        if (target) changed = this.press(target) || changed;
      } else if (p.pressed && state.hit && target && sameHit(state.hit, target)) {
        state.time += dt;
        while (state.time >= REPEAT_DELAY + REPEAT_INTERVAL) {
          state.time -= REPEAT_INTERVAL;
          changed = this.press(target) || changed;
        }
      } else if (!p.pressed) {
        state.hit = null;
      }
      state.wasPressed = p.pressed;
    });
    for (let i = pointers.length; i < this.lasers.length; i++) this.showPointer(i, null, undefined);

    this.statusTimer += dt;
    const hoverChanged = !sameHit(hovered, this.hovered);
    this.hovered = hovered;
    if (changed || hoverChanged || this.statusTimer >= STATUS_INTERVAL) {
      this.statusTimer = 0;
      this.draw();
    }
  }

  private press(hit: Hit): boolean {
    if (hit.row === PAGE_ROW) {
      this.page = (this.page + hit.direction + this.pageCount) % this.pageCount;
      return true;
    }
    const tunable = this.entries[hit.row][1];
    const before = tunable.value;
    nudge(tunable, hit.direction);
    return tunable.value !== before;
  }

  private hitAt(u: number, v: number): Hit | null {
    const x = u * WIDTH_PX;
    const line = Math.floor(((1 - v) * this.canvas.height) / ROW_PX);
    // The page buttons sit on the last header line, in the - and + columns.
    const row = line === HEADER_ROWS - 1 ? PAGE_ROW : line - HEADER_ROWS + this.page * ROWS_PER_PAGE;
    if (row !== PAGE_ROW && (line < HEADER_ROWS || row >= this.entries.length)) return null;
    if (x >= MINUS_X[0] && x <= MINUS_X[1]) return { row, direction: -1 };
    if (x >= PLUS_X[0] && x <= PLUS_X[1]) return { row, direction: 1 };
    return null;
  }

  private showPointer(i: number, origin: Vector3 | null, point: Vector3 | undefined): void {
    if (!this.lasers[i]) {
      const laser = new Line(
        new BufferGeometry().setFromPoints([new Vector3(), new Vector3()]),
        new LineBasicMaterial({ color: 0xffffff }),
      );
      laser.frustumCulled = false;
      const cursor = new Mesh(
        new CircleGeometry(0.008, 12),
        new MeshBasicMaterial({ color: 0xff8a3d }),
      );
      this.lasers[i] = laser;
      this.cursors[i] = cursor;
      this.object.add(laser, cursor);
    }
    const laser = this.lasers[i];
    const cursor = this.cursors[i];
    laser.visible = cursor.visible = !!origin && !!point;
    if (!origin || !point) return;
    const pos = laser.geometry.attributes.position;
    pos.setXYZ(0, origin.x, origin.y, origin.z);
    pos.setXYZ(1, point.x, point.y, point.z);
    pos.needsUpdate = true;
    cursor.quaternion.copy(this.board.quaternion);
    cursor.position.copy(point).addScaledVector(
      new Vector3(0, 0, 1).applyQuaternion(this.board.quaternion),
      0.002,
    );
  }

  private draw(): void {
    const g = this.g;
    const { fps, movementState, lobbyId, note, drawCalls, triangles } = this.getStatus();
    g.fillStyle = '#17212b';
    g.fillRect(0, 0, WIDTH_PX, this.canvas.height);

    g.textBaseline = 'middle';
    g.textAlign = 'left';
    g.fillStyle = '#ffd45e';
    g.font = '700 38px system-ui, sans-serif';
    g.fillText('Nova Pika debug', 24, ROW_PX * 0.5);
    g.textAlign = 'right';
    g.fillStyle = fps >= 71 ? '#8ce99a' : '#ff8787';
    g.fillText(`${fps.toFixed(0)} fps`, WIDTH_PX - 24, ROW_PX * 0.5);
    g.font = '500 26px system-ui, sans-serif';
    g.fillStyle = '#9fb0bf';
    g.fillText(`${drawCalls} draws  ${(triangles / 1000).toFixed(0)}k tris`, WIDTH_PX - 170, ROW_PX * 0.5);

    g.font = '500 30px system-ui, sans-serif';
    g.textAlign = 'left';
    g.fillStyle = '#e9eef2';
    g.fillText(`state: ${movementState}`, 24, ROW_PX * 1.5);
    g.textAlign = 'right';
    g.fillText(`lobby: ${lobbyId}`, WIDTH_PX - 24, ROW_PX * 1.5);
    g.textAlign = 'left';
    g.fillText(note, 24, ROW_PX * 2.5);
    g.fillStyle = '#9fb0bf';
    g.font = '400 24px system-ui, sans-serif';
    g.fillText('Trigger on − / +.  Hold B or Y to hide.', 24, ROW_PX * (HEADER_ROWS - 0.5));
    g.textAlign = 'right';
    g.fillText(`page ${this.page + 1} / ${this.pageCount}`, MINUS_X[0] - 20, ROW_PX * (HEADER_ROWS - 0.5));
    this.drawButton('◀', MINUS_X, (HEADER_ROWS - 1) * ROW_PX, this.isHovered(PAGE_ROW, -1));
    this.drawButton('▶', PLUS_X, (HEADER_ROWS - 1) * ROW_PX, this.isHovered(PAGE_ROW, 1));

    const first = this.page * ROWS_PER_PAGE;
    this.entries.slice(first, first + ROWS_PER_PAGE).forEach(([key, t], i) => {
      const row = first + i;
      const y = (HEADER_ROWS + i) * ROW_PX;
      g.fillStyle = i % 2 ? '#1f2c38' : '#243342';
      g.fillRect(0, y, WIDTH_PX, ROW_PX);

      g.textAlign = 'left';
      g.fillStyle = '#e9eef2';
      g.font = '500 30px system-ui, sans-serif';
      g.fillText(key, 24, y + ROW_PX / 2);

      g.textAlign = 'right';
      g.fillStyle = '#ffd45e';
      g.fillText(`${t.value} ${t.unit}`, MINUS_X[0] - 20, y + ROW_PX / 2);

      this.drawButton('−', MINUS_X, y, this.isHovered(row, -1));
      this.drawButton('+', PLUS_X, y, this.isHovered(row, 1));
    });

    this.texture.needsUpdate = true;
  }

  private isHovered(row: number, direction: 1 | -1): boolean {
    return this.hovered?.row === row && this.hovered.direction === direction;
  }

  private drawButton(label: string, x: readonly [number, number], y: number, hot: boolean): void {
    const g = this.g;
    g.fillStyle = hot ? '#ff8a3d' : '#3b5166';
    g.beginPath();
    g.roundRect(x[0], y + 6, x[1] - x[0], ROW_PX - 12, 10);
    g.fill();
    g.fillStyle = hot ? '#2b1500' : '#e9eef2';
    g.textAlign = 'center';
    g.font = '700 38px system-ui, sans-serif';
    g.fillText(label, (x[0] + x[1]) / 2, y + ROW_PX / 2);
  }
}

function sameHit(a: Hit | null, b: Hit | null): boolean {
  return a === b || (!!a && !!b && a.row === b.row && a.direction === b.direction);
}
