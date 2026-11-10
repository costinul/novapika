import RAPIER from '@dimforge/rapier3d-compat';
import { Vector3 } from 'three';
import type { CastHit, SurfaceHit, WorldQueries } from '../movement/types';

type Vec3 = readonly [number, number, number];

const NO_ROTATION = { x: 0, y: 0, z: 0, w: 1 };

/**
 * Thin wrapper around a Rapier world. Rapier is used for collision queries
 * and toy physics; player movement is custom code that only queries it.
 */
export class PhysicsWorld implements WorldQueries {
  private world: RAPIER.World;
  private readonly castHit: CastHit = { distance: 0, normal: new Vector3() };
  private readonly surfaceHit: SurfaceHit = { point: new Vector3(), normal: new Vector3(), distance: 0 };

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

  addStaticBox(center: Vec3, halfExtents: Vec3): void {
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(...halfExtents).setTranslation(...center),
    );
  }

  /** An upright cylinder. */
  addStaticCylinder(center: Vec3, halfHeight: number, radius: number): void {
    this.world.createCollider(
      RAPIER.ColliderDesc.cylinder(halfHeight, radius).setTranslation(...center),
    );
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
    );
    if (!hit) return null;
    this.castHit.distance = hit.time_of_impact;
    this.castHit.normal.copy(hit.normal1);
    return this.castHit;
  }

  nearestSurface(point: Vector3, maxDistance: number): SurfaceHit | null {
    const out = this.surfaceHit;
    const solid = this.world.projectPoint(point, true);
    if (!solid) return null;

    if (solid.isInside) {
      // The point is inside something: the way out is toward the boundary.
      const boundary = this.world.projectPoint(point, false);
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
