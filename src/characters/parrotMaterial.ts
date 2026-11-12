import { CanvasTexture, CircleGeometry, Mesh, MeshBasicMaterial, MeshLambertMaterial, SRGBColorSpace, Sprite, SpriteMaterial } from 'three';
import type { CharacterDef } from './types';

// The material a parrot's body is drawn with. Most parrots share one plain
// material. A pet that glows or is a rainbow gets one that shimmers, and the
// ultra mythical pet one that shines like a sun; there are a handful in all,
// shared by every parrot that needs them.

/** Seconds the game has run, read by the materials that shimmer. */
const time = { value: 0 };

/** Call once a frame. */
export function tickParrotMaterials(dt: number): void {
  time.value += dt;
  if (auraMaterial) auraMaterial.opacity = 0.75 + 0.25 * Math.sin(time.value * 3);
  if (sunMaterial) {
    // The rays turn slowly, and the whole sun beats.
    sunMaterial.rotation = time.value * 0.35;
    sunMaterial.opacity = 0.88 + 0.12 * Math.sin(time.value * 4);
  }
}

let auraMaterial: SpriteMaterial | null = null;
let sunMaterial: SpriteMaterial | null = null;

/** The ultra mythical pet's halo: a white-hot middle in a ring of rainbow rays. */
function sunTexture(): CanvasTexture {
  const size = 256;
  const mid = size / 2;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d')!;

  // Rays in every colour of the wheel, long and short by turns, fading to their tips.
  const RAYS = 24;
  for (let i = 0; i < RAYS; i++) {
    const angle = (i / RAYS) * Math.PI * 2;
    const reach = mid * (i % 2 === 0 ? 0.98 : 0.7);
    const half = (Math.PI / RAYS) * 0.8;
    const tip = [mid + Math.cos(angle) * reach, mid + Math.sin(angle) * reach];
    const fade = g.createLinearGradient(mid, mid, tip[0], tip[1]);
    const hue = (i / RAYS) * 360;
    fade.addColorStop(0, `hsla(${hue}, 100%, 62%, 1)`);
    fade.addColorStop(0.55, `hsla(${hue}, 100%, 58%, 0.8)`);
    fade.addColorStop(1, `hsla(${hue}, 100%, 55%, 0)`);
    g.fillStyle = fade;
    g.beginPath();
    g.moveTo(mid + Math.cos(angle - half) * mid * 0.2, mid + Math.sin(angle - half) * mid * 0.2);
    g.lineTo(tip[0], tip[1]);
    g.lineTo(mid + Math.cos(angle + half) * mid * 0.2, mid + Math.sin(angle + half) * mid * 0.2);
    g.fill();
  }
  // The middle is bright but not solid: the bird stands in it, and must be seen.
  const core = g.createRadialGradient(mid, mid, 0, mid, mid, mid * 0.6);
  core.addColorStop(0, 'rgba(255, 255, 255, 0.5)');
  core.addColorStop(0.3, 'rgba(255, 250, 200, 0.5)');
  core.addColorStop(0.6, 'rgba(255, 226, 110, 0.35)');
  core.addColorStop(1, 'rgba(255, 200, 80, 0)');
  g.fillStyle = core;
  g.fillRect(0, 0, size, size);

  const map = new CanvasTexture(canvas);
  map.colorSpace = SRGBColorSpace;
  return map;
}

/**
 * A soft halo for a parrot that glows, or null for one that does not. Add it
 * to the parrot's model; it is sized for a bird 1 unit tall, as the model is.
 */
export function parrotAura(def: CharacterDef): Sprite | null {
  // Nothing to draw a halo with outside a browser, as in tests.
  if (!def.specials?.glow || typeof document === 'undefined') return null;
  if (def.specials.sun) {
    sunMaterial ??= new SpriteMaterial({ map: sunTexture(), transparent: true, depthWrite: false });
    const sun = new Sprite(sunMaterial);
    sun.position.y = 0.6;
    // Several times the bird's own height, so that so small a bird is seen from far off.
    sun.scale.setScalar(4.6);
    return sun;
  }
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

/** One badge material for each letter worn, shared by every bird that wears it. */
const emblemMaterials = new Map<string, MeshBasicMaterial>();

/**
 * A round white badge with a letter on it, for a bird that wears one, or null
 * for one that does not. Add it to the parrot's body; it is placed on the
 * chest of a bird 1 unit tall, as the model is, and faces the way the bird does.
 */
export function parrotEmblem(def: CharacterDef): Mesh | null {
  // Nothing to draw a letter with outside a browser, as in tests.
  if (!def.emblem || typeof document === 'undefined') return null;
  let material = emblemMaterials.get(def.emblem);
  if (!material) {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const g = canvas.getContext('2d')!;
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(size / 2, size / 2, size / 2 - 6, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = 9;
    g.strokeStyle = '#ff5fa2';
    g.stroke();
    g.fillStyle = '#16323a';
    g.font = `bold ${size * 0.68}px system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(def.emblem, size / 2, size / 2 + size * 0.04);
    const map = new CanvasTexture(canvas);
    map.colorSpace = SRGBColorSpace;
    material = new MeshBasicMaterial({ map, transparent: true });
    emblemMaterials.set(def.emblem, material);
  }
  const emblem = new Mesh(new CircleGeometry(0.075, 24), material);
  // On the front of the chest, leaning back a little as the chest does.
  emblem.position.set(0, 0.45, -0.178);
  emblem.rotation.set(0.25, Math.PI, 0, 'YXZ');
  return emblem;
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

const SUN = /* glsl */ `
  // Lit from within as brightly as a sun, with a quick beat.
  totalEmissiveRadiance += diffuseColor.rgb * (1.15 + 0.35 * sin(shimmerTime * 4.0)) + vec3(0.12);`;

const materials = new Map<string, MeshLambertMaterial>();

export function parrotMaterial(def: CharacterDef): MeshLambertMaterial {
  const glow = def.specials?.glow ?? false;
  const rainbow = def.specials?.rainbow ?? false;
  const sun = (glow && def.specials?.sun) ?? false;
  const key = `parrot-${glow}-${rainbow}-${sun}`;
  let material = materials.get(key);
  if (material) return material;

  material = new MeshLambertMaterial({ vertexColors: true, flatShading: true });
  if (glow || rainbow) {
    material.onBeforeCompile = (shader) => {
      shader.uniforms.shimmerTime = time;
      let fragment = shader.fragmentShader.replace('#include <common>', '#include <common>\nuniform float shimmerTime;');
      if (rainbow) fragment = fragment.replace('#include <color_fragment>', `#include <color_fragment>${RAINBOW}`);
      if (glow) fragment = fragment.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>${sun ? SUN : GLOW}`);
      shader.fragmentShader = fragment;
    };
    material.customProgramCacheKey = () => key;
  }
  materials.set(key, material);
  return material;
}
