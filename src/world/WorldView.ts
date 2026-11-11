import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  LatheGeometry,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Points,
  PointsMaterial,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  TorusKnotGeometry,
  Vector2,
  Vector3,
} from 'three';
import type { Material, Object3D } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildStatue } from '../characters/parrotGeometry';
import { character } from '../characters/roster';
import { movementConfig } from '../config/movement';
import { PARROT_HEIGHT } from '../player/PlayerView';
import type { PhysicsWorld } from '../engine/physics';
import type { Action } from './actions';
import type { ToyTypeDef } from './types';
import type { Toy, WorldState } from './WorldState';

const SPARKLE_COUNT = 16;
const SPARKLE_LIFE = 0.7; // s
const BELL_SWING = 0.45; // rad, first swing after a ring
const BELL_SWING_FADE = 2.2; // 1/s
const BELL_SWING_RATE = 9; // rad/s
const BELL_AT_REST = 60; // s since a ring after which a bell hangs still
const RING_TODO = new Color(0xff9a3d);
const RING_DONE = new Color(0x6fdc6f);
const SHADOW_MAX_DROP = 30; // m, no shadow for things higher than this above ground
const SHADOW_SPARE = 14; // shadows kept for players and lobby parrots, beyond one per toy
const ONE = new Vector3(1, 1, 1);
/** Size of the parrot models on the choosing perches, against a live parrot. */
const PERCH_MODEL_SCALE = 0.8;

interface BellView {
  pivot: Group;
  /** Seconds since it was last rung. */
  age: number;
}

interface ToyBatch {
  mesh: InstancedMesh;
  toys: Toy[];
}

/** Give every vertex of a geometry one colour, ready to merge with others. */
function tint(geometry: BufferGeometry, color: number): BufferGeometry {
  const flat = geometry.index ? geometry.toNonIndexed() : geometry;
  flat.deleteAttribute('uv');
  const count = flat.attributes.position.count;
  const colors = new Float32Array(count * 3);
  const c = new Color(color);
  for (let i = 0; i < count; i++) c.toArray(colors, i * 3);
  flat.setAttribute('color', new Float32BufferAttribute(colors, 3));
  return flat;
}

/** A simple model for each toy shape, about `size` across. */
function toyGeometry(def: ToyTypeDef): BufferGeometry {
  const s = def.size;
  switch (def.shape) {
    case 'box':
      return new BoxGeometry(s, s, s);
    case 'ball':
      return new SphereGeometry(s / 2, 14, 10);
    case 'knot':
      return new TorusKnotGeometry(s * 0.28, s * 0.11, 40, 6);
    case 'cap':
      return new CylinderGeometry(s / 2, s / 2, s / 4, 12);
    case 'seed':
      return new SphereGeometry(s / 2, 8, 6).scale(0.75, 0.6, 1);
    case 'millet':
      return new CylinderGeometry(s / 7, s / 5, s, 7).rotateX(Math.PI / 2);
    case 'feather':
      return new SphereGeometry(0.5, 8, 4).scale(s / 3, 0.012, s);
  }
}

/** A soft dark spot that fades out toward its edge. */
function shadowTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const g = canvas.getContext('2d')!;
  const fade = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  fade.addColorStop(0, 'rgba(0,0,0,0.45)');
  fade.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = fade;
  g.fillRect(0, 0, 64, 64);
  return new CanvasTexture(canvas);
}

/**
 * Draws a lobby's toys, target places, bells, rings and their effects. Reads
 * WorldState only; all models are simple shapes built in code from the data.
 * Toys of one type, all rings and all shadows are each drawn in one call.
 */
export class WorldView {
  readonly object = new Group();
  private readonly content = new Group();
  private batches: ToyBatch[] = [];
  private readonly bells = new Map<string, BellView>();
  private rings: InstancedMesh | null = null;
  private glints: Points | null = null;
  private glintToys: Toy[] = [];
  private shadows: InstancedMesh | null = null;
  private readonly highlight: Mesh;
  private readonly sparkles: Points;
  private readonly sparkleVelocity: Vector3[] = [];
  private sparkleAge = SPARKLE_LIFE;
  private time = 0;

  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly v = new Vector3();
  private readonly flat = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2);
  private readonly point = new Vector3();
  private readonly scale = new Vector3();
  private shadowCapacity = 0;
  private readonly heading = new Vector3();

  constructor(
    private readonly world: WorldState,
    private readonly physics: PhysicsWorld,
  ) {
    this.highlight = new Mesh(
      new SphereGeometry(1, 16, 10),
      new MeshBasicMaterial({ color: 0xfff27a, transparent: true, opacity: 0.4, depthWrite: false }),
    );
    this.highlight.visible = false;

    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(SPARKLE_COUNT * 3), 3));
    this.sparkles = new Points(
      geometry,
      new PointsMaterial({ color: 0xfff27a, size: 0.06, transparent: true, depthWrite: false }),
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
    this.bells.clear();
    this.batches = [];
    this.glintToys = [];
    this.rings = null;
    this.glints = null;
    this.shadows = null;

    this.buildToys();
    this.buildTargets();
    this.buildBells();
    this.buildRings();
    this.buildPerches();

    if (this.world.toys.size > 0) {
      this.shadowCapacity = this.world.toys.size + SHADOW_SPARE;
      const shadows = new InstancedMesh(
        new CircleGeometry(1, 16),
        new MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false }),
        this.shadowCapacity,
      );
      shadows.frustumCulled = false;
      shadows.renderOrder = 1;
      this.shadows = shadows;
      this.content.add(shadows);
    }
  }

  private buildToys(): void {
    const byType = new Map<string, Toy[]>();
    for (const toy of this.world.toys.values()) {
      if (!byType.has(toy.type)) byType.set(toy.type, []);
      byType.get(toy.type)!.push(toy);
      if (toy.def.glints) this.glintToys.push(toy);
    }
    for (const toys of byType.values()) {
      const def = toys[0].def;
      const mesh = new InstancedMesh(toyGeometry(def), new MeshLambertMaterial({ color: def.color }), toys.length);
      mesh.frustumCulled = false;
      this.batches.push({ mesh, toys });
      this.content.add(mesh);
    }

    if (this.glintToys.length > 0) {
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new BufferAttribute(new Float32Array(this.glintToys.length * 3), 3));
      // A fixed size on screen, so a glint shows from right across the lobby.
      this.glints = new Points(
        geometry,
        new PointsMaterial({
          color: 0xffffff,
          size: 7,
          sizeAttenuation: false,
          transparent: true,
          blending: AdditiveBlending,
          depthWrite: false,
        }),
      );
      this.glints.frustumCulled = false;
      this.content.add(this.glints);
    }
  }

  private buildTargets(): void {
    for (const { def } of this.world.targets.values()) {
      const [w, h, d] = def.size;
      let geometry: BufferGeometry;
      if (def.kind === 'shelf') {
        geometry = new BoxGeometry(w, 0.04, d).translate(0, 0.02, 0);
      } else {
        // An open tray: a floor and four walls.
        const t = 0.03;
        const parts = [
          new BoxGeometry(w, t, d).translate(0, t / 2, 0),
          new BoxGeometry(t, h, d).translate(-w / 2 + t / 2, h / 2, 0),
          new BoxGeometry(t, h, d).translate(w / 2 - t / 2, h / 2, 0),
          new BoxGeometry(w, h, t).translate(0, h / 2, -d / 2 + t / 2),
          new BoxGeometry(w, h, t).translate(0, h / 2, d / 2 - t / 2),
        ];
        geometry = mergeGeometries(parts);
        for (const part of parts) part.dispose();
      }
      const mesh = new Mesh(geometry, new MeshLambertMaterial({ color: def.color, flatShading: true }));
      mesh.position.set(...def.position);
      mesh.rotation.y = def.yaw ?? 0;
      this.content.add(mesh);
    }
  }

  private buildBells(): void {
    const material = new MeshLambertMaterial({ vertexColors: true, side: DoubleSide });
    const made = new Map<string, BufferGeometry>();
    for (const { def } of this.world.peckables.values()) {
      const r = def.radius;
      const key = `${r}:${def.stringLength}`;
      if (!made.has(key)) {
        // Bell outline from crown to lip, as (radius, height) in bell radii.
        const profile = [[0, 1], [0.35, 0.95], [0.6, 0.6], [0.7, 0], [0.85, -0.7], [1.1, -1]];
        const parts = [
          tint(new LatheGeometry(profile.map(([x, y]) => new Vector2(x * r, y * r)), 14), 0xffc933),
          tint(new SphereGeometry(r * 0.25, 8, 6).translate(0, -r, 0), 0x6b4a2b),
          tint(new CylinderGeometry(0.008, 0.008, def.stringLength, 5).translate(0, r + def.stringLength / 2, 0), 0x6b4a2b),
        ];
        // Everything hangs from, and swings about, the top of the string.
        made.set(key, mergeGeometries(parts).translate(0, -(r + def.stringLength), 0));
        for (const part of parts) part.dispose();
      }
      const pivot = new Group();
      pivot.position.set(def.position[0], def.position[1] + r + def.stringLength, def.position[2]);
      pivot.add(new Mesh(made.get(key), material));
      this.content.add(pivot);
      this.bells.set(def.id, { pivot, age: BELL_AT_REST });
    }
  }

  private buildRings(): void {
    const rings = [...this.world.rings.values()];
    if (rings.length === 0) return;
    const mesh = new InstancedMesh(
      new TorusGeometry(1, 0.08, 6, 28),
      new MeshLambertMaterial({ color: 0xffffff }),
      rings.length,
    );
    mesh.frustumCulled = false;
    rings.forEach((ring, i) => {
      this.q.setFromAxisAngle(this.v.set(0, 1, 0), ring.def.yaw);
      mesh.setMatrixAt(i, this.m.compose(ring.position, this.q, this.v.setScalar(ring.def.radius)));
      mesh.setColorAt(i, RING_TODO);
    });
    this.rings = mesh;
    this.content.add(mesh);
  }

  /** A model of each parrot, standing on its perch. */
  private buildPerches(): void {
    const material = new MeshLambertMaterial({ vertexColors: true, flatShading: true });
    for (const { def } of this.world.perches.values()) {
      const who = character(def.characterId);
      const statue = new Mesh(buildStatue(who), material);
      statue.position.set(...def.position);
      statue.rotation.y = def.yaw;
      statue.scale.setScalar(PARROT_HEIGHT * who.scale * PERCH_MODEL_SCALE);
      this.content.add(statue);
    }
  }

  onAction(action: Action): void {
    switch (action.type) {
      case 'chooseCharacter':
      case 'stunt': {
        // A puff of feathers round the parrot.
        const player = this.world.players.get(action.playerId);
        if (player) this.burst(player.head.position, action.type === 'stunt' ? 0xffffff : 0xfff27a);
        break;
      }
      case 'ring': {
        const bell = this.bells.get(action.objectId);
        if (bell) bell.age = 0;
        break;
      }
      case 'place': {
        const toy = this.world.toys.get(action.toyId);
        if (toy) this.burst(toy.position, 0xfff27a);
        break;
      }
      case 'passRing': {
        const ring = this.world.rings.get(action.ringId);
        if (ring) this.burst(ring.position, 0x9dff8a);
        break;
      }
      case 'splash': {
        const water = this.world.water.get(action.waterId);
        const player = this.world.players.get(action.playerId);
        if (water && player) {
          this.burst(this.v.set(player.head.position.x, water.position.y + 0.05, player.head.position.z), 0xbfeaff);
        }
        break;
      }
    }
  }

  update(dt: number, highlighted: Toy | null): void {
    this.time += dt;

    for (const { mesh, toys } of this.batches) {
      toys.forEach((toy, i) => mesh.setMatrixAt(i, this.m.compose(toy.position, toy.quaternion, ONE)));
      mesh.instanceMatrix.needsUpdate = true;
    }

    if (this.glints) {
      const position = this.glints.geometry.attributes.position;
      this.glintToys.forEach((toy, i) => position.setXYZ(i, toy.position.x, toy.position.y + 0.05, toy.position.z));
      position.needsUpdate = true;
      // A slow twinkle with a sharp peak.
      (this.glints.material as PointsMaterial).opacity = Math.pow(0.5 + 0.5 * Math.sin(this.time * 3), 6);
    }

    if (this.rings) {
      let i = 0;
      for (const ring of this.world.rings.values()) this.rings.setColorAt(i++, ring.passed ? RING_DONE : RING_TODO);
      if (this.rings.instanceColor) this.rings.instanceColor.needsUpdate = true;
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

    this.updateShadows();
    this.updateSparkles(dt);
  }

  /** A soft blob on the ground under every toy and every player. */
  private updateShadows(): void {
    const shadows = this.shadows;
    if (!shadows) return;
    let count = 0;
    const cast = (at: Vector3, size: number): void => {
      if (count >= this.shadowCapacity) return;
      const ground = this.physics.groundBelow(at, SHADOW_MAX_DROP);
      if (ground === null) return;
      // The higher something is, the smaller its shadow.
      const shrink = Math.max(0.25, 1 - (at.y - ground) / SHADOW_MAX_DROP);
      this.v.set(at.x, ground + 0.02, at.z);
      shadows.setMatrixAt(count++, this.m.compose(this.v, this.flat, this.scale.setScalar(size * shrink)));
    };
    for (const toy of this.world.toys.values()) cast(toy.position, toy.def.size * 0.9);
    for (const player of this.world.players.values()) {
      this.point.copy(player.head.position);
      this.point.y -= movementConfig.bodyHeight.value - 0.05;
      const index = count;
      cast(this.point, 0.45);
      if (count === index) continue;
      // A parrot's shadow is wider than long, turns with it, and spins in a roll.
      shadows.getMatrixAt(index, this.m);
      this.m.decompose(this.v, this.q, this.scale);
      this.heading.set(0, 0, -1).applyQuaternion(player.head.quaternion);
      const turn = Math.atan2(-this.heading.x, -this.heading.z) + player.wings.roll;
      this.q.setFromAxisAngle(this.heading.set(0, 1, 0), turn).multiply(this.flat);
      this.scale.x *= 1.7;
      this.scale.y *= 0.8;
      shadows.setMatrixAt(index, this.m.compose(this.v, this.q, this.scale));
    }
    shadows.count = count;
    shadows.instanceMatrix.needsUpdate = true;
  }

  private updateSparkles(dt: number): void {
    if (this.sparkleAge >= SPARKLE_LIFE) return;
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

  /** A puff of sparkles flying up and out from a point. */
  burst(at: Vector3, color: number): void {
    const position = this.sparkles.geometry.attributes.position;
    for (let i = 0; i < SPARKLE_COUNT; i++) {
      const angle = (i / SPARKLE_COUNT) * Math.PI * 2;
      const speed = 0.5 + (i % 3) * 0.25;
      this.sparkleVelocity[i].set(Math.cos(angle) * speed, 1.2 + (i % 4) * 0.3, Math.sin(angle) * speed);
      position.setXYZ(i, at.x, at.y, at.z);
    }
    position.needsUpdate = true;
    (this.sparkles.material as PointsMaterial).color.set(color);
    this.sparkleAge = 0;
    this.sparkles.visible = true;
  }
}

function disposeTree(root: Object3D): void {
  const seen = new Set<BufferGeometry | Material>();
  root.traverse((obj) => {
    const mesh = obj as Partial<Mesh>;
    const materials = mesh.material ? (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) : [];
    for (const item of [mesh.geometry, ...materials]) {
      if (item && !seen.has(item)) {
        seen.add(item);
        item.dispose();
      }
    }
    for (const material of materials) (material as MeshBasicMaterial).map?.dispose();
  });
}
