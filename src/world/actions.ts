import type { WorldState } from './WorldState';

/**
 * Every change to the shared world is one of these named actions, addressed
 * by stable ids. Nothing changes a toy or rings a bell any other way.
 */
export type Action =
  | { type: 'pickUp'; playerId: string; toyId: string }
  | { type: 'drop'; playerId: string }
  | { type: 'place'; toyId: string; targetId: string }
  /** Food was eaten: the toy goes back to where it started. */
  | { type: 'eat'; toyId: string }
  | { type: 'ring'; objectId: string; playerId: string }
  | { type: 'passRing'; ringId: string; playerId: string }
  | { type: 'splash'; waterId: string; playerId: string }
  /** Take a toy out of another parrot's beak. */
  | { type: 'take'; playerId: string; toyId: string }
  | { type: 'chooseCharacter'; playerId: string; characterId: string }
  /** A stunt was recognised. Changes nothing; it is cheered with a chirp. */
  | { type: 'stunt'; playerId: string; name: string }
  /** An activity was finished: every bell rung, or every ring flown. */
  | { type: 'celebrate'; what: 'bells' | 'rings' };

export type ActionListener = (action: Action) => void;

/**
 * The single gate world changes pass through. In v1 it approves an action
 * locally and applies it at once. With multiplayer, `dispatch` is where an
 * action is sent to the server instead, and applied when the server agrees.
 */
export class ActionLayer {
  private readonly listeners: ActionListener[] = [];

  constructor(private readonly world: WorldState) {}

  /** Returns false if the action is not allowed right now. */
  dispatch(action: Action): boolean {
    if (!this.world.allows(action)) return false;
    this.world.apply(action);
    for (const listener of this.listeners) listener(action);
    return true;
  }

  /** Be told about every action after it has been applied (for sound and effects). */
  onApplied(listener: ActionListener): void {
    this.listeners.push(listener);
  }
}
