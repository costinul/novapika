import { Color, DoubleSide, InstancedMesh, Matrix4, MeshLambertMaterial, Vector3 } from 'three';
import { featherGeometry } from './parrotGeometry';

/**
 * Every wing feather of every parrot, drawn in one call. Each frame the
 * parrots add their feathers afresh between `begin` and `end`.
 */
export class FeatherBatch {
  readonly mesh: InstancedMesh;
  private count = 0;
  private readonly m = new Matrix4();
  private readonly x = new Vector3();
  private readonly z = new Vector3();
  private readonly scale = new Vector3();
  private readonly color = new Color();

  constructor(private readonly capacity = 320) {
    this.mesh = new InstancedMesh(
      featherGeometry(),
      new MeshLambertMaterial({ color: 0xffffff, side: DoubleSide, flatShading: true }),
      capacity,
    );
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
  }

  begin(): void {
    this.count = 0;
  }

  /**
   * Add one feather from `root`, pointing along the unit vector `direction`
   * and lying as flat as it can against the plane with normal `normal`.
   */
  add(root: Vector3, direction: Vector3, normal: Vector3, length: number, color: number): void {
    if (this.count >= this.capacity) return;
    // Across the feather, then its true flat side.
    this.x.crossVectors(direction, normal);
    if (this.x.lengthSq() < 1e-8) this.x.set(1, 0, 0);
    this.x.normalize();
    this.z.crossVectors(this.x, direction).normalize();
    this.m.makeBasis(this.x, direction, this.z).scale(this.scale.setScalar(length)).setPosition(root);
    this.mesh.setMatrixAt(this.count, this.m);
    this.mesh.setColorAt(this.count, this.color.set(color));
    this.count++;
  }

  end(): void {
    this.mesh.count = this.count;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
