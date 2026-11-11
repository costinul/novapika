import { CanvasTexture, MeshLambertMaterial, Sprite, SpriteMaterial } from 'three';
import type { CharacterDef } from './types';

// The material a parrot's body is drawn with. Most parrots share one plain
// material. A pet that glows or is a rainbow gets one that shimmers; there
// are four in all, shared by every parrot that needs them.

/** Seconds the game has run, read by the materials that shimmer. */
const time = { value: 0 };

/** Call once a frame. */
export function tickParrotMaterials(dt: number): void {
  time.value += dt;
  if (auraMaterial) auraMaterial.opacity = 0.75 + 0.25 * Math.sin(time.value * 3);
}

let auraMaterial: SpriteMaterial | null = null;

/**
 * A soft halo for a parrot that glows, or null for one that does not. Add it
 * to the parrot's model; it is sized for a bird 1 unit tall, as the model is.
 */
export function parrotAura(def: CharacterDef): Sprite | null {
  if (!def.specials?.glow) return null;
  if (!auraMaterial) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const g = canvas.getContext('2d')!;
    const fade = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    fade.addColorStop(0, 'rgba(255, 246, 190, 0.95)');
    fade.addColorStop(0.45, 'rgba(255, 240, 160, 0.5)');
    fade.addColorStop(1, 'rgba(255, 236, 140, 0)');
    g.fillStyle = fade;
    g.fillRect(0, 0, 64, 64);
    auraMaterial = new SpriteMaterial({ map: new CanvasTexture(canvas), transparent: true, depthWrite: false });
  }
  const aura = new Sprite(auraMaterial);
  aura.position.y = 0.5;
  aura.scale.setScalar(1.9);
  return aura;
}

const RAINBOW = /* glsl */ `
  {
    // Turn every colour round the colour wheel together, so the bands flow.
    float turn = shimmerTime * 1.6;
    vec3 grey = vec3(0.57735);
    vec3 c = diffuseColor.rgb;
    diffuseColor.rgb = max(
      c * cos(turn) + cross(grey, c) * sin(turn) + grey * dot(grey, c) * (1.0 - cos(turn)),
      0.0
    );
  }`;

const GLOW = /* glsl */ `
  // Lit from within, with a slow pulse.
  totalEmissiveRadiance += diffuseColor.rgb * (0.55 + 0.3 * sin(shimmerTime * 3.0));`;

const materials = new Map<string, MeshLambertMaterial>();

export function parrotMaterial(def: CharacterDef): MeshLambertMaterial {
  const glow = def.specials?.glow ?? false;
  const rainbow = def.specials?.rainbow ?? false;
  const key = `parrot-${glow}-${rainbow}`;
  let material = materials.get(key);
  if (material) return material;

  material = new MeshLambertMaterial({ vertexColors: true, flatShading: true });
  if (glow || rainbow) {
    material.onBeforeCompile = (shader) => {
      shader.uniforms.shimmerTime = time;
      let fragment = shader.fragmentShader.replace('#include <common>', '#include <common>\nuniform float shimmerTime;');
      if (rainbow) fragment = fragment.replace('#include <color_fragment>', `#include <color_fragment>${RAINBOW}`);
      if (glow) fragment = fragment.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>${GLOW}`);
      shader.fragmentShader = fragment;
    };
    material.customProgramCacheKey = () => key;
  }
  materials.set(key, material);
  return material;
}
