import { DirectionalLight, HemisphereLight, Mesh, PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import type { Dna } from '../../shared/dna';
import { buildStatue } from '../characters/parrotGeometry';
import { parrotAura, parrotMaterial } from '../characters/parrotMaterial';
import { petCharacter } from '../characters/pets';

// Still pictures of pets for the admin page, drawn with the same parrot
// builder as the game, so a pet looks the same in both.

const SIZE = 240; // px

let renderer: WebGLRenderer | null = null;
const scene = new Scene();
const camera = new PerspectiveCamera(30, 1, 0.1, 20);
const made = new Map<string, string>();

/** A picture of the pet with this DNA, as an image address. */
export function petPicture(dna: Dna): string {
  const key = JSON.stringify(dna);
  const before = made.get(key);
  if (before) return before;

  if (!renderer) {
    renderer = new WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(SIZE, SIZE, false);
    scene.add(new HemisphereLight(0xffffff, 0xdfe8c8, 2.4));
    const sun = new DirectionalLight(0xfff2d6, 1.4);
    sun.position.set(-3, 6, -5);
    scene.add(sun);
    // The bird faces -Z: look at it from the front, a little to one side.
    camera.position.set(-1.1, 0.8, -3.1);
    camera.lookAt(0, 0.4, 0);
  }

  const def = petCharacter('picture', dna);
  const statue = new Mesh(buildStatue(def), parrotMaterial(def));
  const aura = parrotAura(def);
  if (aura) statue.add(aura);
  scene.add(statue);
  renderer.render(scene, camera);
  const picture = renderer.domElement.toDataURL('image/png');
  scene.remove(statue);
  statue.geometry.dispose();

  made.set(key, picture);
  return picture;
}
