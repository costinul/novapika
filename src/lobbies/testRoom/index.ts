import {
  BoxGeometry,
  BackSide,
  CanvasTexture,
  CircleGeometry,
  CylinderGeometry,
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
const WALL_HEIGHT = 4; // m, visible wall
const LID_HEIGHT = 6; // m, invisible ceiling so nobody climbs out
const WALL_THICKNESS = 0.5; // m, physics only

type Vec3 = readonly [number, number, number];

/** Solid things to push off and climb: [colour, centre, size]. */
const BLOCKS: readonly (readonly [number, Vec3, Vec3])[] = [
  // Steps of rising height on the left.
  [0xff7a70, [-2.5, 0.15, -1], [1, 0.3, 1]],
  [0xffb24d, [-3.5, 0.3, -1], [1, 0.6, 1]],
  [0x4fc7b5, [-3.5, 0.5, -2.2], [1, 1, 1]],
  [0x9b7bea, [-3.5, 0.75, -3.4], [1, 1.5, 1]],
  // Free-standing climbing wall straight ahead.
  [0x5aa9f0, [0, 1.6, -3.5], [3, 3.2, 0.4]],
];

/** Upright poles: [colour, base centre x, z, height, radius]. */
const POLES: readonly (readonly [number, number, number, number, number])[] = [
  [0xc98a4b, 3, -1.5, 3.5, 0.12],
];

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
    const lid = LID_HEIGHT / 2;
    physics.addStaticBox([0, -t, 0], [half, t, half]);
    physics.addStaticBox([0, LID_HEIGHT + t, 0], [half, t, half]);
    physics.addStaticBox([half + t, lid, 0], [t, lid, half]);
    physics.addStaticBox([-half - t, lid, 0], [t, lid, half]);
    physics.addStaticBox([0, lid, half + t], [half, lid, t]);
    physics.addStaticBox([0, lid, -half - t], [half, lid, t]);

    // White tiles tinted by each block's colour, half a metre per tile.
    const blockTex = tileTexture('#ffffff', '#d9d9d9');
    for (const [color, center, size] of BLOCKS) {
      const map = blockTex.clone();
      map.repeat.set(Math.max(size[0], size[2]) * 2, size[1] * 2);
      const mesh = new Mesh(new BoxGeometry(...size), new MeshLambertMaterial({ color, map }));
      mesh.position.set(...center);
      root.add(mesh);
      physics.addStaticBox(center, [size[0] / 2, size[1] / 2, size[2] / 2]);
    }

    for (const [color, x, z, height, radius] of POLES) {
      const mesh = new Mesh(
        new CylinderGeometry(radius, radius, height, 12),
        new MeshLambertMaterial({ color }),
      );
      mesh.position.set(x, height / 2, z);
      root.add(mesh);
      physics.addStaticCylinder([x, height / 2, z], height / 2, radius);
    }

    return { root };
  },
};

export default testRoom;
