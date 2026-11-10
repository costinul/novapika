import { ConeGeometry, Group, Mesh, MeshLambertMaterial, SphereGeometry } from 'three';
import { movementConfig } from '../config/movement';
import { BEAK_OFFSET } from '../world/beak';
import { HANDS } from './Player';
import type { Handedness, Player } from './Player';

const COLOR_WING = 0xffc83d; // hand in open air
const COLOR_CLAW = 0xff5a36; // hand planted on a surface

/**
 * Draws a player. Reads only Player state, never the headset, so the same
 * view works for remote players and lobby parrots later.
 * So far this draws the hands and beak tip; the parrot body arrives with characters.
 */
export class PlayerView {
  readonly object = new Group();
  private readonly hands: Record<Handedness, { group: Group; material: MeshLambertMaterial }>;
  private readonly head = new Group();

  constructor(private readonly player: Player) {
    const tip = new MeshLambertMaterial({ color: 0xff8a3d });
    const ball = new SphereGeometry(1, 16, 12); // scaled to the claw radius
    const nub = new ConeGeometry(0.5, 1.2, 10).rotateX(-Math.PI / 2).translate(0, 0, -1.2);

    const makeHand = (): { group: Group; material: MeshLambertMaterial } => {
      const group = new Group();
      const material = new MeshLambertMaterial({ color: COLOR_WING });
      group.add(new Mesh(ball, material), new Mesh(nub, tip));
      this.object.add(group);
      return { group, material };
    };
    this.hands = { left: makeHand(), right: makeHand() };

    // Beak tip, seen at the bottom of the player's own view.
    const beak = new Mesh(
      new ConeGeometry(0.02, 0.07, 8).rotateX(-Math.PI / 2),
      new MeshLambertMaterial({ color: 0x77778a }),
    );
    beak.position.copy(BEAK_OFFSET);
    beak.rotation.x = -0.4; // hooked slightly downward
    this.head.add(beak);
    this.object.add(this.head);
  }

  update(): void {
    this.head.position.copy(this.player.head.position);
    this.head.quaternion.copy(this.player.head.quaternion);

    const r = movementConfig.handRadius.value;
    for (const h of HANDS) {
      const pose = this.player.hands[h].grip;
      const { group, material } = this.hands[h];
      group.position.copy(pose.position);
      group.quaternion.copy(pose.quaternion);
      group.scale.setScalar(r);
      material.color.setHex(this.player.claws[h].planted ? COLOR_CLAW : COLOR_WING);
    }
  }
}
