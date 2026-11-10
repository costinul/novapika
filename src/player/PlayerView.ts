import { ConeGeometry, Group, Mesh, MeshLambertMaterial, SphereGeometry } from 'three';
import { movementConfig } from '../config/movement';
import { HANDS } from './Player';
import type { Handedness, Player } from './Player';

/**
 * Draws a player. Reads only Player state, never the headset, so the same
 * view works for remote players and lobby parrots later.
 * Milestone 1 draws the hands only; the parrot body arrives with characters.
 */
export class PlayerView {
  readonly object = new Group();
  private readonly hands: Record<Handedness, Group>;

  constructor(private readonly player: Player) {
    const claw = new MeshLambertMaterial({ color: 0xffc83d });
    const tip = new MeshLambertMaterial({ color: 0xff8a3d });
    const ball = new SphereGeometry(1, 16, 12); // scaled to the claw radius
    const nub = new ConeGeometry(0.5, 1.2, 10).rotateX(-Math.PI / 2).translate(0, 0, -1.2);

    const makeHand = (): Group => {
      const g = new Group();
      g.add(new Mesh(ball, claw), new Mesh(nub, tip));
      this.object.add(g);
      return g;
    };
    this.hands = { left: makeHand(), right: makeHand() };
  }

  update(): void {
    const r = movementConfig.handRadius.value;
    for (const h of HANDS) {
      const pose = this.player.hands[h].grip;
      const view = this.hands[h];
      view.position.copy(pose.position);
      view.quaternion.copy(pose.quaternion);
      view.scale.setScalar(r);
    }
  }
}
