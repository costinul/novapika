import {
  CanvasTexture,
  DirectionalLight,
  DoubleSide,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
} from 'three';
import { StaticBuilder } from '../build';
import { sky } from '../sky';
import type { LobbyModule } from '../types';
import { CONTENT, SIGN, SPAWNS } from './layout';
import { buildScenery } from './scenery';

/** The town sign's board: the town's name over a little clock tower, the same on both sides. */
function townSign(): Group {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#f6efd9';
  g.fillRect(0, 0, 512, 256);
  g.strokeStyle = '#25272b';
  g.lineWidth = 10;
  g.strokeRect(5, 5, 502, 246);

  // The clock tower, small, in the middle.
  g.fillStyle = '#25272b';
  g.fillRect(244, 150, 24, 78);
  g.fillRect(232, 108, 48, 46);
  g.beginPath();
  g.moveTo(228, 108);
  g.lineTo(256, 70);
  g.lineTo(284, 108);
  g.fill();
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.arc(256, 131, 15, 0, Math.PI * 2);
  g.fill();

  g.fillStyle = '#8d4f27';
  g.font = 'bold 50px Georgia, serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('DOWNHAM', 256, 42);
  g.font = 'bold 34px Georgia, serif';
  g.fillText('MARKET', 120, 200);
  g.fillText('NORFOLK', 396, 200);

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  const material = new MeshBasicMaterial({ map: texture, side: DoubleSide });
  const sign = new Group();
  // One sheet on each side of the board's back, so the words read the right way from both.
  for (const side of [1, -1]) {
    const sheet = new Mesh(new PlaneGeometry(SIGN.width, SIGN.board), material);
    sheet.position.set(SIGN.post[0], SIGN.height, SIGN.post[2] + side * 0.045);
    sheet.rotation.y = side > 0 ? 0 : Math.PI;
    sign.add(sheet);
  }
  return sign;
}

/**
 * Downham Market: the market place with its clock tower, the Town Hall, and
 * the ginger-brown shops and houses of the town. See layout.ts for where
 * everything is and scenery.ts for how it is built.
 */
const downhamMarket: LobbyModule = {
  id: 'downham-market',
  name: 'Downham Market',
  skyColor: 0xcfeeff,
  spawnPoints: SPAWNS.map((position) => ({ position })),
  content: CONTENT,
  ambience: { leaves: false, birds: true },

  load({ physics }) {
    const root = new Group();

    root.add(new HemisphereLight(0xffffff, 0xd8d2c0, 2.3));
    const sun = new DirectionalLight(0xfff2d6, 1.6);
    sun.position.set(30, 60, 20);
    root.add(sun);

    const dome = sky(0xcfeeff, 0x5fb4f2);
    dome.renderOrder = -1;
    root.add(dome);

    const builder = new StaticBuilder(physics);
    buildScenery(builder);
    root.add(builder.mesh());
    root.add(townSign());

    return { root };
  },
};

export default downhamMarket;
