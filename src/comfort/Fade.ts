import { Mesh, MeshBasicMaterial, PlaneGeometry } from 'three';

/**
 * Blacks the whole view out, for the moment one place is swapped for
 * another. It is a black sheet fixed in front of the eyes. Add `object` to
 * the camera.
 */
export class Fade {
  readonly object: Mesh;
  private readonly material = new MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0,
    depthTest: false,
    depthWrite: false,
  });

  constructor() {
    // Close to the eyes and wide enough to cover the whole view.
    this.object = new Mesh(new PlaneGeometry(2, 2), this.material);
    this.object.position.z = -0.2;
    // Over everything, the speed vignette included.
    this.object.renderOrder = 1001;
    this.object.frustumCulled = false;
    this.object.visible = false;
  }

  /** `dark` is 0 for a clear view, 1 for black. */
  set(dark: number): void {
    this.material.opacity = dark;
    this.object.visible = dark > 0;
  }
}
