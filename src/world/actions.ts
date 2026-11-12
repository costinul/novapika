import type { Action } from '../../shared/actions';
import type { WorldState } from './WorldState';

/**
 * Every change to the shared world is one of these named actions, addressed
 * by stable ids. Nothing changes a toy or rings a bell any other way.
 */
export type { Action } from '../../shared/actions';

/** `remote` is true for something another player's game made happen. */
export type ActionListener = (action: Action, remote: boolean) => void;

/**
 * The single gate world changes pass through. An action this game makes
 * happen is checked, applied at once, and, with other players about, passed
 * on to them. One another game made happen is taken as done.
 */
export class ActionLayer {
  private readonly listeners: ActionListener[] = [];
  /** With other players about: called with each action this game makes happen, to pass it on. */
  onLocal: ((action: Action) => void) | null = null;

  constructor(private readonly world: WorldState) {}

  /** Returns false if the action is not allowed right now. */
  dispatch(action: Action): boolean {
    if (!this.world.allows(action)) return false;
    this.world.apply(action);
    for (const listener of this.listeners) listener(action, false);
    this.onLocal?.(action);
    return true;
  }

  /**
   * Something another player's game made happen. It has happened, whatever
   * this game had in mind; only an action about things this lobby does not
   * have is left out.
   */
  receive(action: Action): void {
    if (!this.world.makeWay(action)) return;
    this.world.apply(action);
    for (const listener of this.listeners) listener(action, true);
  }

  /** Be told about every action after it has been applied (for sound and effects). */
  onApplied(listener: ActionListener): void {
    this.listeners.push(listener);
  }
}
