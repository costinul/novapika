import { DirectionalLight, Group, HemisphereLight } from 'three';
import { StaticBuilder } from '../build';
import { sky } from '../sky';
import type { LobbyModule } from '../types';
import { CONTENT, SPAWNS } from './layout';
import { buildScenery } from './scenery';

/**
 * New York: Times Square with its billboards and yellow taxis, the Empire
 * State Building, and the Statue of Liberty on her island in the harbour.
 * See layout.ts for where everything is and scenery.ts for how it is built.
 */
const newYork: LobbyModule = {
  id: 'new-york',
  name: 'New York',
  skyColor: 0xc9e4f7,
  spawnPoints: SPAWNS.map((position) => ({ position })),
  content: CONTENT,
  ambience: { leaves: false, birds: true },

  load({ physics }) {
    const root = new Group();

    root.add(new HemisphereLight(0xffffff, 0xd8d2c0, 2.3));
    const sun = new DirectionalLight(0xfff2d6, 1.6);
    sun.position.set(30, 60, 20);
    root.add(sun);

    const dome = sky(0xc9e4f7, 0x4f9fe6);
    dome.renderOrder = -1;
    root.add(dome);

    const builder = new StaticBuilder(physics);
    buildScenery(builder);
    root.add(builder.mesh());

    return { root };
  },
};

export default newYork;
