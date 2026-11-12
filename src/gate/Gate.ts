import { Vector3 } from 'three';
import { HANDS } from '../player/Player';
import type { Player } from '../player/Player';
import { beakPosition } from '../world/beak';
import type { GateDef } from '../world/types';
import { gateLayout, onPicture, OPENING, toGate } from './layout';
import type { GateLayout } from './layout';

/**
 * The rules of a place's gate, for the local player. Touching a picture on
 * the board picks a place; flying through the doorway then leads there. No
 * drawing and no sound in here.
 *
 * What is picked is the player's own business: it is not an action, and
 * nobody else is told.
 */
export class Gate {
  /** Where this place's gate is, or null in a place without one. */
  layout: GateLayout | null = null;
  /** The place picked on the board, by lobby id. */
  picked: string | null = null;
  /** Called when a place is picked, with the middle of its picture. */
  onPicked: ((placeId: string, at: Vector3) => void) | null = null;

  /** How far in front of the doorway the head was a frame ago, or null if not known. */
  private lastFront: number | null = null;
  private readonly beak = new Vector3();
  private readonly point = new Vector3();

  /** A place has loaded: `def` is its gate, if it has one, and `here` its lobby id. */
  load(def: GateDef | undefined, here: string): void {
    this.layout = def ? gateLayout(def, here) : null;
    this.picked = null;
    this.lastFront = null;
  }

  /**
   * Once per drawn frame, with fresh head and hand poses. Returns the place
   * to go to if the player has just come through the doorway with one picked.
   */
  update(player: Player): string | null {
    const layout = this.layout;
    if (!layout) return null;

    const { def } = layout;
    toGate(def, beakPosition(player.head, this.beak), this.beak);
    for (const { placeId, position, local } of layout.pictures) {
      if (placeId === this.picked) continue;
      const touching =
        onPicture(this.beak, local) ||
        HANDS.some((h) => onPicture(toGate(def, player.hands[h].grip.position, this.point), local));
      if (touching) {
        this.picked = placeId;
        this.onPicked?.(placeId, this.point.set(...position));
      }
    }

    // Through the doorway: the head goes from in front of the sheet to behind it, inside the opening.
    const head = toGate(def, player.head.position, this.point);
    const front = head.z - OPENING.z;
    const before = this.lastFront;
    this.lastFront = front;
    const through =
      before !== null &&
      before > 0 &&
      front <= 0 &&
      Math.abs(head.x) < OPENING.halfWidth &&
      head.y > OPENING.bottom &&
      head.y < OPENING.top;
    return through ? this.picked : null;
  }
}
