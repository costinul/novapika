import {
  CircleGeometry,
  CylinderGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshLambertMaterial,
} from 'three';
import { breed } from '../../../shared/breeding';
import type { Dna } from '../../../shared/dna';
import { founders } from '../../../shared/founders';
import { buildStatue } from '../../characters/parrotGeometry';
import { parrotAura, parrotMaterial } from '../../characters/parrotMaterial';
import { petCharacter } from '../../characters/pets';
import { PARROT_HEIGHT } from '../../player/PlayerView';
import type { LobbyModule } from '../types';

// A bare room for looking at pets: the fixed pets on the front bar, and on
// the bar behind them some babies bred from pairs of them. Open it with
// ?lobby=pet-show. Nothing here is part of the game itself.

const FLOOR_RADIUS = 12; // m
const SPACING = 0.4; // m between pets on a bar
const FRONT_BAR = { y: 1.0, z: -2.0 };
const BACK_BAR = { y: 1.5, z: -2.6 };
/** Pairs of fixed pets to breed for the back bar, and how many babies of each. */
const PAIRS: readonly (readonly [string, string])[] = [
  ['pip', 'sky'],
  ['coco', 'ember'],
  ['tango', 'trio'],
  ['aurora', 'prism'],
];
const BABIES_PER_PAIR = 2;

/** The same babies every visit, so a change in the rules is easy to spot. */
function steadyRandom(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const petShow: LobbyModule = {
  id: 'pet-show',
  name: 'Pet Show',
  skyColor: 0x8fd3ff,
  spawnPoints: [{ position: [0, 0, 0] }],

  load({ physics }) {
    const root = new Group();
    root.add(new HemisphereLight(0xffffff, 0xdfe8c8, 2.4));
    const sun = new DirectionalLight(0xfff2d6, 1.4);
    sun.position.set(4, 10, 6);
    root.add(sun);

    const floor = new Mesh(new CircleGeometry(FLOOR_RADIUS, 48), new MeshLambertMaterial({ color: 0x9ed67f }));
    floor.rotation.x = -Math.PI / 2;
    root.add(floor);
    physics.addStaticBox([0, -0.25, 0], [FLOOR_RADIUS, 0.25, FLOOR_RADIUS]);

    const wood = new MeshLambertMaterial({ color: 0xc98a4b });
    /** A row of pets on a bar, facing the spawn point. */
    const row = (pets: Dna[], bar: { y: number; z: number }): void => {
      const width = pets.length * SPACING;
      const rail = new Mesh(new CylinderGeometry(0.02, 0.02, width, 8), wood);
      rail.rotation.z = Math.PI / 2;
      rail.position.set(0, bar.y, bar.z);
      root.add(rail);
      for (const end of [-1, 1]) {
        const post = new Mesh(new CylinderGeometry(0.03, 0.03, bar.y, 8), wood);
        post.position.set((end * width) / 2, bar.y / 2, bar.z);
        root.add(post);
      }
      pets.forEach((dna, i) => {
        const def = petCharacter(`show-${bar.z}-${i}`, dna);
        const statue = new Mesh(buildStatue(def), parrotMaterial(def));
        statue.position.set((i - (pets.length - 1) / 2) * SPACING, bar.y + 0.02, bar.z);
        statue.rotation.y = Math.PI;
        statue.scale.setScalar(PARROT_HEIGHT * def.scale);
        const aura = parrotAura(def);
        if (aura) statue.add(aura);
        root.add(statue);
      });
    };

    row(
      Object.values(founders).map((founder) => founder.dna),
      FRONT_BAR,
    );
    const random = steadyRandom(1);
    row(
      PAIRS.flatMap(([a, b]) =>
        Array.from({ length: BABIES_PER_PAIR }, () => breed(founders[a].dna, founders[b].dna, random)),
      ),
      BACK_BAR,
    );

    return { root };
  },
};

export default petShow;
