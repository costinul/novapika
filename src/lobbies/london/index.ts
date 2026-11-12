import { DirectionalLight, Group, HemisphereLight } from 'three';
import { StaticBuilder } from '../build';
import { sky } from '../sky';
import type { LobbyModule } from '../types';
import { CONTENT, SPAWNS } from './layout';
import { buildScenery } from './scenery';

/**
 * London: Big Ben and the Houses of Parliament, the Thames with its two
 * bridges, the London Eye and a red bus. See layout.ts for where everything
 * is and scenery.ts for how it is built.
 */
const london: LobbyModule = {
  id: 'london',
  name: 'London',
  skyColor: 0xcfe6f5,
  spawnPoints: SPAWNS.map((position) => ({ position })),
  content: CONTENT,
  ambience: { leaves: false, birds: true },

  load({ physics }) {
    const root = new Group();

    root.add(new HemisphereLight(0xffffff, 0xd8d2c0, 2.3));
    const sun = new DirectionalLight(0xfff2d6, 1.6);
    sun.position.set(30, 60, 20);
    root.add(sun);

    const dome = sky(0xcfe6f5, 0x5fa8e6);
    dome.renderOrder = -1;
    root.add(dome);

    const builder = new StaticBuilder(physics);
    buildScenery(builder);
    root.add(builder.mesh());

    return { root };
  },
};

export default london;
