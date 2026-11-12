import {
  CanvasTexture,
  DirectionalLight,
  DoubleSide,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  RepeatWrapping,
  SRGBColorSpace,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { StaticBuilder } from '../build';
import { sky } from '../sky';
import { howToBoard } from './howTo';
import type { LobbyModule } from '../types';
import { CONTENT, HALF, HEIGHT, SPAWNS } from './layout';
import { buildScenery } from './scenery';

const NET_CELL = 1; // m, size of one square of netting

/** One square of netting: thin lines on a clear background. */
function netTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const g = canvas.getContext('2d')!;
  g.strokeStyle = '#dfe9f0';
  g.lineWidth = 3;
  g.strokeRect(0, 0, 64, 64);
  const tex = new CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** The four net sides and the net roof, as one mesh. */
function netting(): Mesh {
  const size = 2 * HALF;
  const side = (rotationY: number, x: number, z: number): PlaneGeometry => {
    const plane = new PlaneGeometry(size, HEIGHT);
    plane.attributes.uv.array.forEach((_, i, uv) => (uv[i] *= (i % 2 ? HEIGHT : size) / NET_CELL));
    return plane.rotateY(rotationY).translate(x, HEIGHT / 2, z) as PlaneGeometry;
  };
  const roof = new PlaneGeometry(size, size);
  roof.attributes.uv.array.forEach((_, i, uv) => (uv[i] *= size / NET_CELL));
  roof.rotateX(Math.PI / 2).translate(0, HEIGHT, 0);

  const parts = [
    side(0, 0, -HALF),
    side(Math.PI, 0, HALF),
    side(Math.PI / 2, -HALF, 0),
    side(-Math.PI / 2, HALF, 0),
    roof,
  ];
  const merged = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  return new Mesh(
    merged,
    new MeshBasicMaterial({ map: netTexture(), alphaTest: 0.5, side: DoubleSide }),
  );
}

/**
 * The Aviary: a giant outdoor bird enclosure full of trees and parrot toys.
 * See layout.ts for where everything is and scenery.ts for how it is built.
 */
const aviary: LobbyModule = {
  id: 'aviary',
  name: 'The Aviary',
  skyColor: 0xcfeeff,
  spawnPoints: SPAWNS.map((position) => ({ position })),
  content: CONTENT,
  ambience: { leaves: true, birds: true },

  load({ physics }) {
    const root = new Group();

    root.add(new HemisphereLight(0xffffff, 0xcfe8b0, 2.3));
    const sun = new DirectionalLight(0xfff2d6, 1.6);
    sun.position.set(30, 60, 20);
    root.add(sun);

    const dome = sky(0xcfeeff, 0x5fb4f2);
    dome.renderOrder = -1;
    root.add(dome);

    const builder = new StaticBuilder(physics);
    buildScenery(builder);
    root.add(builder.mesh());
    root.add(netting());
    root.add(howToBoard());

    return { root };
  },
};

export default aviary;
