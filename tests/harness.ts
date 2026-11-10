import { Vector3 } from 'three';
import { movementConfig } from '../src/config/movement';
import { PhysicsWorld } from '../src/engine/physics';
import { placeAt, stepMovement } from '../src/movement/step';
import type { MoveInput } from '../src/movement/types';
import { HANDS, Player } from '../src/player/Player';

export const DT = 1 / 120;
export const HEAD_Y = 1.6;
export const cfg = movementConfig;

export const lerp = (a: number, b: number, t: number): number =>
  a + (b - a) * Math.min(1, Math.max(0, t));

/**
 * A player on a large flat floor, moved by synthetic hand traces against
 * real collision geometry. No headset needed.
 */
export class Sim {
  readonly player = new Player('test', 'nova');
  readonly input: MoveInput = {
    head: new Vector3(0, HEAD_Y, 0),
    headForward: new Vector3(0, 0, -1),
    hands: {
      left: { position: new Vector3(-0.25, HEAD_Y - 0.3, -0.3), gripPressed: false },
      right: { position: new Vector3(0.25, HEAD_Y - 0.3, -0.3), gripPressed: false },
    },
  };
  time = 0;

  constructor(
    private readonly physics: PhysicsWorld,
    addObstacles?: (physics: PhysicsWorld) => void,
  ) {
    physics.clear();
    physics.addStaticBox([0, -0.5, 0], [500, 0.5, 500]);
    addObstacles?.(physics);
    physics.step(DT);
    placeAt(this.player, this.input, cfg, new Vector3(0, 0, 0));
  }

  /** Run the simulation, letting `trace` move the hands before every step. */
  run(seconds: number, trace?: (t: number) => void): void {
    const end = this.time + seconds;
    while (this.time < end - 1e-9) {
      this.time += DT;
      trace?.(this.time);
      stepMovement(this.player, this.input, this.physics, cfg, DT);
    }
  }

  /** Set both hands, in tracking space, mirrored left and right. */
  hands(x: number, y: number, z: number): void {
    this.input.hands.left.position.set(-x, y, z);
    this.input.hands.right.position.set(x, y, z);
  }

  /** Move the player straight up into open air, at rest. */
  lift(height: number): void {
    this.player.position.y += height;
    for (const h of HANDS) this.player.claws[h].last.y += height;
    this.player.grounded = false;
  }

  get speedAcross(): number {
    return Math.hypot(this.player.velocity.x, this.player.velocity.z);
  }
}
