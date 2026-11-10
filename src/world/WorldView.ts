import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  LatheGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Points,
  PointsMaterial,
  SphereGeometry,
  Vector2,
  Vector3,
} from 'three';
import type { BufferGeometry as Geometry, Material, Object3D } from 'three';
import type { Action } from './actions';
import type { Toy, WorldState } from './WorldState';

const SPARKLE_COUNT = 16;
const SPARKLE_LIFE = 0.7; // s
const BELL_SWING = 0.45; // rad, first swing after a ring
const BELL_SWING_FADE = 2.2; // 1/s
const BELL_SWING_RATE = 9; // rad/s
const BELL_AT_REST = 60; // s since a ring after which a bell hangs still

interface BellView {
  pivot: Group;
  /** Seconds since it was last rung. */
  age: number;
}

/**
 * Draws a lobby's toys, target places and bells, and their effects. Reads
 * WorldState only; all models are simple shapes built in code from the data.
 */
export class WorldView {
  readonly object = new Group();
  private readonly content = new Group();
  private readonly toyMeshes = new Map<string, Mesh>();
  private readonly bells = new Map<string, BellView>();
  private readonly highlight: Mesh;
  private readonly sparkles: Points;
  private readonly sparkleVelocity: Vector3[] = [];
  private sparkleAge = SPARKLE_LIFE;
  private time = 0;

  constructor(private readonly world: WorldState) {
    this.highlight = new Mesh(
      new SphereGeometry(1, 16, 10),
      new MeshBasicMaterial({ color: 0xfff27a, transparent: true, opacity: 0.4, depthWrite: false }),
    );
    this.highlight.visible = false;

    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(SPARKLE_COUNT * 3), 3));
    this.sparkles = new Points(
      geometry,
      new PointsMaterial({ color: 0xfff27a, size: 0.05, transparent: true, depthWrite: false }),
    );
    this.sparkles.frustumCulled = false;
    this.sparkles.visible = false;
    for (let i = 0; i < SPARKLE_COUNT; i++) this.sparkleVelocity.push(new Vector3());

    this.object.add(this.content, this.highlight, this.sparkles);
  }

  /** Build the models for whatever the world now holds. Call after a lobby loads. */
  rebuild(): void {
    disposeTree(this.content);
    this.content.clear();
    this.toyMeshes.clear();
    this.bells.clear();

    const geometries = new Map<string, Geometry>();
    const materials = new Map<string, MeshLambertMaterial>();
    for (const toy of this.world.toys.values()) {
      const { shape, size, color } = toy.def;
      if (!geometries.has(toy.type)) {
        geometries.set(toy.type, shape === 'box' ? new BoxGeometry(size, size, size) : new SphereGeometry(size / 2, 14, 10));
        materials.set(toy.type, new MeshLambertMaterial({ color }));
      }
      const mesh = new Mesh(geometries.get(toy.type), materials.get(toy.type));
      this.toyMeshes.set(toy.id, mesh);
      this.content.add(mesh);
    }

    for (const { def } of this.world.targets.values()) {
      const [w, h, d] = def.size;
      const wall = new MeshLambertMaterial({ color: def.color, side: DoubleSide });
      const open = new MeshLambertMaterial({ visible: false });
      // Box faces: +x, -x, +y (top, left open), -y, +z, -z
      const box = new Mesh(new BoxGeometry(w, h, d), [wall, wall, open, wall, wall, wall]);
      box.position.set(def.position[0], def.position[1] + h / 2, def.position[2]);
      this.content.add(box);
    }

    const gold = new MeshLambertMaterial({ color: 0xffc933, side: DoubleSide });
    const dark = new MeshLambertMaterial({ color: 0x6b4a2b });
    for (const { def } of this.world.peckables.values()) {
      const r = def.radius;
      // Bell outline from crown to lip, as (radius, height) in bell radii.
      const profile = [[0, 1], [0.35, 0.95], [0.6, 0.6], [0.7, 0], [0.85, -0.7], [1.1, -1]];
      const bell = new Mesh(new LatheGeometry(profile.map(([x, y]) => new Vector2(x * r, y * r)), 14), gold);
      const clapper = new Mesh(new SphereGeometry(r * 0.25, 8, 6), dark);
      clapper.position.y = -r;
      const string = new Mesh(new CylinderGeometry(0.008, 0.008, def.stringLength, 5), dark);
      string.position.y = r + def.stringLength / 2;

      // Everything hangs from, and swings about, the top of the string.
      const hanging = new Group();
      hanging.position.y = -(r + def.stringLength);
      hanging.add(bell, clapper, string);
      const pivot = new Group();
      pivot.position.set(def.position[0], def.position[1] + r + def.stringLength, def.position[2]);
      pivot.add(hanging);
      this.content.add(pivot);
      this.bells.set(def.id, { pivot, age: BELL_AT_REST });
    }
  }

  onAction(action: Action): void {
    if (action.type === 'ring') {
      const bell = this.bells.get(action.objectId);
      if (bell) bell.age = 0;
    } else if (action.type === 'place') {
      const toy = this.world.toys.get(action.toyId);
      if (toy) this.burst(toy.position);
    }
  }

  update(dt: number, highlighted: Toy | null): void {
    this.time += dt;

    for (const toy of this.world.toys.values()) {
      const mesh = this.toyMeshes.get(toy.id);
      if (!mesh) continue;
      mesh.position.copy(toy.position);
      mesh.quaternion.copy(toy.quaternion);
    }

    this.highlight.visible = !!highlighted;
    if (highlighted) {
      this.highlight.position.copy(highlighted.position);
      this.highlight.scale.setScalar(highlighted.def.size * (0.95 + 0.08 * Math.sin(this.time * 8)));
    }

    for (const bell of this.bells.values()) {
      bell.age += dt;
      bell.pivot.rotation.z =
        BELL_SWING * Math.exp(-BELL_SWING_FADE * bell.age) * Math.sin(BELL_SWING_RATE * bell.age);
    }

    if (this.sparkleAge < SPARKLE_LIFE) {
      this.sparkleAge += dt;
      const position = this.sparkles.geometry.attributes.position;
      for (let i = 0; i < SPARKLE_COUNT; i++) {
        const v = this.sparkleVelocity[i];
        v.y -= 3 * dt;
        position.setXYZ(i, position.getX(i) + v.x * dt, position.getY(i) + v.y * dt, position.getZ(i) + v.z * dt);
      }
      position.needsUpdate = true;
      (this.sparkles.material as PointsMaterial).opacity = Math.max(0, 1 - this.sparkleAge / SPARKLE_LIFE);
      this.sparkles.visible = this.sparkleAge < SPARKLE_LIFE;
    }
  }

  /** A puff of sparkles flying up and out from a point. */
  private burst(at: Vector3): void {
    const position = this.sparkles.geometry.attributes.position;
    for (let i = 0; i < SPARKLE_COUNT; i++) {
      const angle = (i / SPARKLE_COUNT) * Math.PI * 2;
      const speed = 0.5 + (i % 3) * 0.25;
      this.sparkleVelocity[i].set(Math.cos(angle) * speed, 1.2 + (i % 4) * 0.3, Math.sin(angle) * speed);
      position.setXYZ(i, at.x, at.y, at.z);
    }
    position.needsUpdate = true;
    this.sparkleAge = 0;
    this.sparkles.visible = true;
  }
}

function disposeTree(root: Object3D): void {
  const seen = new Set<Geometry | Material>();
  root.traverse((obj) => {
    const mesh = obj as Partial<Mesh>;
    const materials = mesh.material ? (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) : [];
    for (const item of [mesh.geometry, ...materials]) {
      if (item && !seen.has(item)) {
        seen.add(item);
        item.dispose();
      }
    }
  });
}
