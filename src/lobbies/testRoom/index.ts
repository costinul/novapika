import {
  BoxGeometry,
  BackSide,
  CanvasTexture,
  CircleGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshLambertMaterial,
  PlaneGeometry,
  RepeatWrapping,
  SRGBColorSpace,
} from 'three';
import type { LobbyModule } from '../types';

const SIZE = 10; // m, floor is SIZE x SIZE
const WALL_HEIGHT = 4; // m
const WALL_THICKNESS = 0.5; // m, physics only

/** A square tile with a border line, so one tile reads as one metre. */
function tileTexture(fill: string, line: string): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const g = canvas.getContext('2d')!;
  g.fillStyle = fill;
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = line;
  g.lineWidth = 4;
  g.strokeRect(0, 0, 128, 128);
  const tex = new CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

const testRoom: LobbyModule = {
  id: 'test-room',
  name: 'Test Room',
  skyColor: 0x8fd3ff,
  spawnPoints: [{ position: [0, 0, 0] }],

  load({ physics }) {
    const root = new Group();

    root.add(new HemisphereLight(0xffffff, 0xdfe8c8, 2.4));
    const sun = new DirectionalLight(0xfff2d6, 1.4);
    sun.position.set(4, 10, 6);
    root.add(sun);

    const floorTex = tileTexture('#9ed67f', '#86c267');
    floorTex.repeat.set(SIZE, SIZE);
    const floor = new Mesh(
      new PlaneGeometry(SIZE, SIZE),
      new MeshLambertMaterial({ map: floorTex }),
    );
    floor.rotation.x = -Math.PI / 2;
    root.add(floor);

    // Spawn marker.
    const pad = new Mesh(
      new CircleGeometry(0.6, 24),
      new MeshLambertMaterial({ color: 0xffd45e }),
    );
    pad.rotation.x = -Math.PI / 2;
    pad.position.y = 0.005;
    root.add(pad);

    // Four walls: an open-topped box seen from the inside.
    const wallTex = tileTexture('#ffe9c7', '#f2d3a3');
    wallTex.repeat.set(SIZE, WALL_HEIGHT);
    const wallMat = new MeshLambertMaterial({ map: wallTex, side: BackSide });
    const hidden = new MeshLambertMaterial({ visible: false });
    const walls = new Mesh(
      new BoxGeometry(SIZE, WALL_HEIGHT, SIZE),
      // Box faces: +x, -x, +y (top), -y (bottom), +z, -z
      [wallMat, wallMat, hidden, hidden, wallMat, wallMat],
    );
    walls.position.y = WALL_HEIGHT / 2;
    root.add(walls);

    const half = SIZE / 2;
    const t = WALL_THICKNESS / 2;
    physics.addStaticBox([0, -t, 0], [half, t, half]);
    physics.addStaticBox([half + t, WALL_HEIGHT / 2, 0], [t, WALL_HEIGHT / 2, half]);
    physics.addStaticBox([-half - t, WALL_HEIGHT / 2, 0], [t, WALL_HEIGHT / 2, half]);
    physics.addStaticBox([0, WALL_HEIGHT / 2, half + t], [half, WALL_HEIGHT / 2, t]);
    physics.addStaticBox([0, WALL_HEIGHT / 2, -half - t], [half, WALL_HEIGHT / 2, t]);

    return { root };
  },
};

export default testRoom;
