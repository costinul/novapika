import RAPIER from '@dimforge/rapier3d-compat';

type Vec3 = readonly [number, number, number];

/**
 * Thin wrapper around a Rapier world. Rapier is used for collision queries
 * and toy physics; player movement is custom code that only queries it.
 */
export class PhysicsWorld {
  private world: RAPIER.World;

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

  step(dtSeconds: number): void {
    this.world.timestep = dtSeconds;
    this.world.step();
  }

  /** Throw away everything in the world. Called when a lobby unloads. */
  clear(): void {
    this.world.free();
    this.world = PhysicsWorld.newWorld();
  }
}
