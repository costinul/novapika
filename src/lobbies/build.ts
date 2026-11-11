import {
  BoxGeometry,
  CircleGeometry,
  Color,
  CylinderGeometry,
  Float32BufferAttribute,
  IcosahedronGeometry,
  Matrix4,
  Mesh,
  MeshLambertMaterial,
  Quaternion,
  Vector3,
} from 'three';
import type { BufferGeometry } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { PhysicsWorld } from '../engine/physics';
import type { Vec3 } from '../world/types';

const UP = new Vector3(0, 1, 0);

/**
 * Builds a lobby's fixed scenery out of simple coloured shapes. Each solid
 * shape also gets a matching collider. Everything is merged into one mesh
 * with one material, so a whole lobby costs a single draw call.
 */
export class StaticBuilder {
  private readonly parts: BufferGeometry[] = [];
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly color = new Color();

  constructor(private readonly physics: PhysicsWorld) {}

  /** A box, optionally turned about the vertical axis. */
  box(color: number, center: Vec3, size: Vec3, opts: { yaw?: number; solid?: boolean } = {}): void {
    const yaw = opts.yaw ?? 0;
    this.m.makeRotationY(yaw).setPosition(...center);
    this.add(new BoxGeometry(...size), color);
    if (opts.solid ?? true) {
      this.physics.addStaticBox(center, [size[0] / 2, size[1] / 2, size[2] / 2], yaw);
    }
  }

  /** An invisible solid box, for things drawn some other way. */
  barrier(center: Vec3, size: Vec3): void {
    this.physics.addStaticBox(center, [size[0] / 2, size[1] / 2, size[2] / 2]);
  }

  /** A round bar from `a` to `b`: trunks, branches, ropes, rungs, posts. */
  limb(
    color: number,
    a: Vec3,
    b: Vec3,
    radiusA: number,
    radiusB = radiusA,
    opts: { sides?: number; solid?: boolean } = {},
  ): void {
    const axis = new Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const length = axis.length();
    this.q.setFromUnitVectors(UP, axis.normalize());
    this.m.makeRotationFromQuaternion(this.q).setPosition((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
    this.add(new CylinderGeometry(radiusB, radiusA, length, opts.sides ?? 7), color);
    if (opts.solid ?? true) this.physics.addStaticBar(a, b, (radiusA + radiusB) / 2);
  }

  /** A faceted lump for leaves, stones, hills and clouds. Never solid. */
  blob(color: number, center: Vec3, radius: number, squash = 1, detail = 1): void {
    this.m.makeScale(radius, radius * squash, radius).setPosition(...center);
    this.add(new IcosahedronGeometry(1, detail), color);
  }

  /** A flat round patch lying on the ground. Never solid. */
  disc(color: number, center: Vec3, radius: number, sides = 24): void {
    this.m.makeRotationX(-Math.PI / 2).setPosition(...center);
    this.add(new CircleGeometry(radius, sides), color);
  }

  /** An upright solid drum, such as a platform. */
  drum(color: number, center: Vec3, radius: number, height: number, sides = 16): void {
    this.m.makeTranslation(...center);
    this.add(new CylinderGeometry(radius, radius, height, sides), color);
    this.physics.addStaticCylinder(center, height / 2, radius);
  }

  /** The finished scenery as one mesh. */
  mesh(): Mesh {
    const merged = mergeGeometries(this.parts);
    for (const part of this.parts) part.dispose();
    return new Mesh(merged, new MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  }

  private add(geometry: BufferGeometry, color: number): void {
    const flat = geometry.index ? geometry.toNonIndexed() : geometry;
    if (flat !== geometry) geometry.dispose();
    flat.applyMatrix4(this.m);
    flat.deleteAttribute('uv');
    const count = flat.attributes.position.count;
    const colors = new Float32Array(count * 3);
    this.color.set(color);
    for (let i = 0; i < count; i++) this.color.toArray(colors, i * 3);
    flat.setAttribute('color', new Float32BufferAttribute(colors, 3));
    this.parts.push(flat);
  }
}
