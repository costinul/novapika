import RAPIER from '@dimforge/rapier3d-compat';
import { Quaternion, Vector3 } from 'three';
import type { CastHit, SurfaceHit, WorldQueries } from '../movement/types';

type Vec3 = readonly [number, number, number];

const NO_ROTATION = { x: 0, y: 0, z: 0, w: 1 };
// Players only touch the fixed world. Toys never block or carry a player.
const FIXED_ONLY = RAPIER.QueryFilterFlags.ONLY_FIXED;

const UP = new Vector3(0, 1, 0);

/** A toy's physics body. Only valid until the world is cleared. */
export type BodyRef = RAPIER.RigidBody;

/**
 * Thin wrapper around a Rapier world. Rapier is used for collision queries
 * and toy physics; player movement is custom code that only queries it.
 */
export class PhysicsWorld implements WorldQueries {
  private world: RAPIER.World;
  private readonly castHit: CastHit = { distance: 0, normal: new Vector3() };
  private readonly surfaceHit: SurfaceHit = { point: new Vector3(), normal: new Vector3(), distance: 0 };
  private readonly v = new Vector3();
  private readonly q = new Quaternion();
  private readonly down = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });

  private constructor() {
    this.world = PhysicsWorld.newWorld();
  }

  static async create(): Promise<PhysicsWorld> {
    await RAPIER.init();
    return new PhysicsWorld();
  }

  private static newWorld(): RAPIER.World {
    return new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  }

  /** A box, optionally turned about the vertical axis by `yaw` radians. */
  addStaticBox(center: Vec3, halfExtents: Vec3, yaw = 0): void {
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(...halfExtents)
        .setTranslation(...center)
        .setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }),
    );
  }

  /** A round bar with flat ends between two points: trunks, branches, ropes, rungs. */
  addStaticBar(a: Vec3, b: Vec3, radius: number): void {
    const axis = this.v.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const length = axis.length();
    this.q.setFromUnitVectors(UP, axis.normalize());
    this.world.createCollider(
      RAPIER.ColliderDesc.cylinder(length / 2, radius)
        .setTranslation((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2)
        .setRotation(this.q),
    );
  }

  /** An upright cylinder. */
  addStaticCylinder(center: Vec3, halfHeight: number, radius: number): void {
    this.world.createCollider(
      RAPIER.ColliderDesc.cylinder(halfHeight, radius).setTranslation(...center),
    );
  }

  /**
   * A light, movable body for a toy: a ball of radius `half[0]`, or a box
   * with the given half extents. `floatiness` 0 falls normally; towards 1 it
   * drifts down slowly like a feather.
   */
  addToyBody(
    collider: 'box' | 'ball',
    half: Vec3,
    position: Vec3,
    density: number,
    bounce: number,
    floatiness = 0,
  ): BodyRef {
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(...position)
        .setCcdEnabled(true)
        .setGravityScale(1 - 0.9 * floatiness)
        .setLinearDamping(4 * floatiness)
        .setAngularDamping(0.5 + 4 * floatiness),
    );
    const desc = collider === 'box' ? RAPIER.ColliderDesc.cuboid(...half) : RAPIER.ColliderDesc.ball(half[0]);
    this.world.createCollider(desc.setDensity(density).setRestitution(bounce).setFriction(0.8), body);
    return body;
  }

  isAsleep(body: BodyRef): boolean {
    return body.isSleeping();
  }

  /** Height of the fixed surface straight below a point, or null if none within `maxDrop`. */
  groundBelow(point: Vector3, maxDrop: number): number | null {
    const hit = this.world.castRay(this.ray(point), maxDrop, true, FIXED_ONLY);
    return hit ? point.y - hit.timeOfImpact : null;
  }

  private ray(origin: Vector3): RAPIER.Ray {
    this.down.origin.x = origin.x;
    this.down.origin.y = origin.y;
    this.down.origin.z = origin.z;
    return this.down;
  }

  readBody(body: BodyRef, position: Vector3, quaternion: Quaternion): void {
    position.copy(body.translation());
    quaternion.copy(body.rotation());
  }

  bodyVelocity(body: BodyRef, out: Vector3): Vector3 {
    return out.copy(body.linvel());
  }

  /** Take a body out of the simulation while something carries it. */
  holdBody(body: BodyRef): void {
    body.setEnabled(false);
  }

  /** Put a body back into the simulation at a position, moving at a velocity. */
  releaseBody(body: BodyRef, position: Vector3, quaternion: Quaternion, velocity: Vector3): void {
    body.setEnabled(true);
    body.setTranslation(position, true);
    body.setRotation(quaternion, true);
    body.setLinvel(velocity, true);
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  }

  step(dtSeconds: number): void {
    this.world.timestep = dtSeconds;
    this.world.step();
  }

  /** Throw away everything in the world. Called when a lobby unloads. */
  clear(): void {
    this.world.free();
    this.world = PhysicsWorld.newWorld();
  }

  castSphere(origin: Vector3, direction: Vector3, maxDistance: number, radius: number): CastHit | null {
    const hit = this.world.castShape(
      origin,
      NO_ROTATION,
      direction,
      new RAPIER.Ball(radius),
      0,
      maxDistance,
      true,
      FIXED_ONLY,
    );
    if (!hit) return null;
    this.castHit.distance = hit.time_of_impact;
    this.castHit.normal.copy(hit.normal1);
    return this.castHit;
  }

  nearestSurface(point: Vector3, maxDistance: number): SurfaceHit | null {
    const out = this.surfaceHit;
    const solid = this.world.projectPoint(point, true, FIXED_ONLY);
    if (!solid) return null;

    if (solid.isInside) {
      // The point is inside something: the way out is toward the boundary.
      const boundary = this.world.projectPoint(point, false, FIXED_ONLY);
      if (!boundary) return null;
      out.point.copy(boundary.point);
      out.normal.copy(out.point).sub(point);
      out.distance = -out.normal.length();
    } else {
      out.point.copy(solid.point);
      out.normal.copy(point).sub(out.point);
      out.distance = out.normal.length();
      if (out.distance > maxDistance) return null;
    }
    if (Math.abs(out.distance) < 1e-9) out.normal.set(0, 1, 0);
    else out.normal.multiplyScalar(1 / Math.abs(out.distance));
    return out;
  }
}
