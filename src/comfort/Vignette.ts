import { CanvasTexture, Mesh, MeshBasicMaterial, PlaneGeometry } from 'three';
import type { MovementConfig } from '../config/movement';

/** How dark the edges of the view should be at a speed, 0..1. Zero when switched off. */
export function vignetteOpacity(speed: number, cfg: MovementConfig): number {
  if (!cfg.comfortVignette.value) return 0;
  const from = cfg.vignetteFromSpeed.value;
  const full = cfg.maxFlySpeed.value;
  const t = Math.min(1, Math.max(0, (speed - from) / Math.max(0.1, full - from)));
  return cfg.vignetteStrength.value * t;
}

/**
 * Darkens the edges of the view at high speed, which eases motion sickness.
 * It is a sheet fixed in front of the eyes, clear in the middle and dark
 * toward the rim. Add `object` to the camera.
 */
export class Vignette {
  readonly object: Mesh;
  private readonly material: MeshBasicMaterial;
  private shown = 0;

  constructor() {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;
    const g = canvas.getContext('2d')!;
    const fade = g.createRadialGradient(128, 128, 60, 128, 128, 128);
    fade.addColorStop(0, 'rgba(0,0,0,0)');
    fade.addColorStop(0.6, 'rgba(0,0,0,0.75)');
    fade.addColorStop(1, 'rgba(0,0,0,1)');
    g.fillStyle = fade;
    g.fillRect(0, 0, 256, 256);

    this.material = new MeshBasicMaterial({
      map: new CanvasTexture(canvas),
      transparent: true,
      opacity: 0,
      depthTest: false,
      depthWrite: false,
    });
    // Close to the eyes and wide enough to cover the whole view.
    this.object = new Mesh(new PlaneGeometry(1.1, 1.1), this.material);
    this.object.position.z = -0.25;
    this.object.renderOrder = 1000;
    this.object.frustumCulled = false;
    this.object.visible = false;
  }

  update(speed: number, cfg: MovementConfig, dt: number): void {
    const wanted = vignetteOpacity(speed, cfg);
    // Ease in and out, so it is never a flicker.
    this.shown += (wanted - this.shown) * (1 - Math.exp(-4 * dt));
    this.material.opacity = this.shown;
    this.object.visible = this.shown > 0.01;
  }
}
