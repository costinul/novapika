import { Quaternion, Vector3 } from 'three';
import { HANDS } from '../player/Player';
import type { Handedness, MovementState, Player } from '../player/Player';

// How one parrot's pose travels: a fixed run of bytes holding what drawing
// and touching need, and no more. Written from a Player on the game that
// simulates it, read into a Player on every other.

/** Bytes one pose takes in a frame. */
export const POSE_BYTES = 57;

/** Whose pose it is, relative to the player who sent the frame. */
export const POSE_PLAYER = 0;
export const POSE_FOLLOWER = 1;
/** POSE_FLOCK + n is the lobby's n-th own parrot. Only the host sends these. */
export const POSE_FLOCK = 2;

const STATES: readonly MovementState[] = [
  'standing',
  'climbing',
  'hanging',
  'flapping',
  'gliding',
  'diving',
  'rolling',
  'falling',
];

const clamp16 = (x: number): number => Math.max(-32767, Math.min(32767, Math.round(x)));
const clamp8 = (x: number): number => Math.max(0, Math.min(255, Math.round(x)));

/** One pose as it came off the wire. */
export class Pose {
  kind = 0;
  state: MovementState = 'standing';
  /** World position of the origin. Head and hands are relative to it. */
  readonly position = new Vector3();
  readonly velocity = new Vector3();
  readonly head = new Vector3();
  readonly headTurn = new Quaternion();
  readonly hands: Record<Handedness, Vector3> = { left: new Vector3(), right: new Vector3() };
  readonly planted: Record<Handedness, boolean> = { left: false, right: false };
  readonly clawNormal: Record<Handedness, Vector3> = { left: new Vector3(0, 1, 0), right: new Vector3(0, 1, 0) };
  flapping = false;
  rolling: -1 | 0 | 1 = 0;
  roll = 0;
  stamina = 1;
  reachScale = 1;
  excitement = 0;
}

function writeVector(view: DataView, at: number, v: Vector3, scale: number): void {
  view.setInt16(at, clamp16(v.x * scale), true);
  view.setInt16(at + 2, clamp16(v.y * scale), true);
  view.setInt16(at + 4, clamp16(v.z * scale), true);
}

function readVector(view: DataView, at: number, v: Vector3, scale: number): void {
  v.set(view.getInt16(at, true) / scale, view.getInt16(at + 2, true) / scale, view.getInt16(at + 4, true) / scale);
}

/** Write `player`'s pose into `view` at byte `at`. */
export function writePose(view: DataView, at: number, kind: number, player: Player): void {
  const { wings, claws, input } = player;
  view.setUint8(at, kind);
  view.setUint8(
    at + 1,
    Math.max(0, STATES.indexOf(player.movementState)) |
      (claws.left.planted ? 8 : 0) |
      (claws.right.planted ? 16 : 0) |
      (wings.flapping ? 32 : 0) |
      ((wings.rolling === 1 ? 1 : wings.rolling === -1 ? 2 : 0) << 6),
  );
  view.setFloat32(at + 2, player.position.x, true);
  view.setFloat32(at + 6, player.position.y, true);
  view.setFloat32(at + 10, player.position.z, true);
  writeVector(view, at + 14, player.velocity, 100); // cm/s
  writeVector(view, at + 20, input.head.position, 1000); // mm
  const q = input.head.quaternion;
  view.setInt16(at + 26, clamp16(q.x * 32767), true);
  view.setInt16(at + 28, clamp16(q.y * 32767), true);
  view.setInt16(at + 30, clamp16(q.z * 32767), true);
  view.setInt16(at + 32, clamp16(q.w * 32767), true);
  HANDS.forEach((h, i) => {
    writeVector(view, at + 34 + i * 6, input.hands[h].grip.position, 1000);
    const n = claws[h].normal;
    view.setInt8(at + 46 + i * 3, Math.round(n.x * 127));
    view.setInt8(at + 47 + i * 3, Math.round(n.y * 127));
    view.setInt8(at + 48 + i * 3, Math.round(n.z * 127));
  });
  view.setInt16(at + 52, clamp16(wings.roll * 1000), true);
  view.setUint8(at + 54, clamp8(player.stamina * 255));
  view.setUint8(at + 55, clamp8(player.reachScale * 100));
  view.setUint8(at + 56, clamp8(player.excitement * 255));
}

/** Read the pose at byte `at` of `view` into `out`. */
export function readPose(view: DataView, at: number, out: Pose): void {
  out.kind = view.getUint8(at);
  const flags = view.getUint8(at + 1);
  out.state = STATES[flags & 7];
  out.planted.left = (flags & 8) !== 0;
  out.planted.right = (flags & 16) !== 0;
  out.flapping = (flags & 32) !== 0;
  const rolling = flags >> 6;
  out.rolling = rolling === 1 ? 1 : rolling === 2 ? -1 : 0;
  out.position.set(view.getFloat32(at + 2, true), view.getFloat32(at + 6, true), view.getFloat32(at + 10, true));
  readVector(view, at + 14, out.velocity, 100);
  readVector(view, at + 20, out.head, 1000);
  out.headTurn
    .set(view.getInt16(at + 26, true), view.getInt16(at + 28, true), view.getInt16(at + 30, true), view.getInt16(at + 32, true))
    .normalize();
  HANDS.forEach((h, i) => {
    readVector(view, at + 34 + i * 6, out.hands[h], 1000);
    out.clawNormal[h]
      .set(view.getInt8(at + 46 + i * 3), view.getInt8(at + 47 + i * 3), view.getInt8(at + 48 + i * 3))
      .normalize();
  });
  out.roll = view.getInt16(at + 52, true) / 1000;
  out.stamina = view.getUint8(at + 54) / 255;
  out.reachScale = view.getUint8(at + 55) / 100;
  out.excitement = view.getUint8(at + 56) / 255;
}

/** Put `player` where the poses say, `t` (0..1) of the way from `a` to `b`. */
export function applyPose(player: Player, a: Pose, b: Pose, t: number): void {
  const near = t < 0.5 ? a : b;
  player.position.lerpVectors(a.position, b.position, t);
  player.velocity.lerpVectors(a.velocity, b.velocity, t);
  player.input.head.position.lerpVectors(a.head, b.head, t);
  player.input.head.quaternion.slerpQuaternions(a.headTurn, b.headTurn, t);
  for (const h of HANDS) {
    player.input.hands[h].grip.position.lerpVectors(a.hands[h], b.hands[h], t);
    player.claws[h].planted = near.planted[h];
    player.claws[h].normal.copy(near.clawNormal[h]);
  }
  player.movementState = near.state;
  player.wings.flapping = near.flapping;
  player.wings.rolling = near.rolling;
  // A roll that has just finished snaps back to level rather than unwinding.
  player.wings.roll = Math.abs(b.roll - a.roll) > Math.PI ? near.roll : a.roll + (b.roll - a.roll) * t;
  player.stamina = a.stamina + (b.stamina - a.stamina) * t;
  player.reachScale = near.reachScale;
  player.excitement = a.excitement + (b.excitement - a.excitement) * t;
  player.updateWorldPoses();
}

/** How far behind now a parrot run elsewhere is drawn, so there is always a pose either side. */
export const POSE_DELAY = 0.1; // s
const KEPT = 8;

/** The last few poses heard for one parrot, and where it is between them. */
export class PoseTrack {
  private readonly poses = Array.from({ length: KEPT }, () => new Pose());
  private readonly times = new Array<number>(KEPT).fill(0);
  private count = 0;
  private next = 0;

  /** True once at least one pose has been heard. */
  get started(): boolean {
    return this.count > 0;
  }

  /** When the newest pose was heard, in seconds. */
  get heardAt(): number {
    return this.count > 0 ? this.times[(this.next - 1 + KEPT) % KEPT] : -Infinity;
  }

  /** Forget every pose heard. */
  reset(): void {
    this.count = 0;
  }

  /** Take in the pose at byte `at` of `view`, heard at `time` seconds. */
  push(view: DataView, at: number, time: number): void {
    readPose(view, at, this.poses[this.next]);
    this.times[this.next] = time;
    this.next = (this.next + 1) % KEPT;
    this.count = Math.min(KEPT, this.count + 1);
  }

  /** Put `player` where it was `POSE_DELAY` before `time`. */
  apply(player: Player, time: number): void {
    if (this.count === 0) return;
    const want = time - POSE_DELAY;
    // Newest first: find the pair of poses either side of the wanted moment.
    let newer = (this.next - 1 + KEPT) % KEPT;
    for (let i = 1; i < this.count; i++) {
      const older = (newer - 1 + KEPT) % KEPT;
      if (this.times[older] <= want) {
        const span = this.times[newer] - this.times[older];
        const t = span > 0 ? Math.min(1, (want - this.times[older]) / span) : 1;
        return applyPose(player, this.poses[older], this.poses[newer], t);
      }
      newer = older;
    }
    // Everything heard is newer than wanted: start from the oldest.
    applyPose(player, this.poses[newer], this.poses[newer], 1);
  }
}
