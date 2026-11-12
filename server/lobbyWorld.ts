import type { Action, ToyPlace } from '../shared/actions';
import type { SharedWorld } from '../shared/net';

/**
 * What a lobby remembers of its toys, bells and rings: enough to settle who
 * got a toy first, and to tell a newcomer how things stand. It knows nothing
 * of where the toys started or what they are; ids are just names to it.
 */
export class LobbyWorld {
  /** Toy to the parrot carrying it. */
  private readonly holders = new Map<string, string>();
  /** Loose, moving toy to the member whose game is moving it. */
  private readonly sims = new Map<string, string>();
  /** Toy to the place it has been put in. */
  private readonly placed = new Map<string, string>();
  /** Toy to where it last came to rest, if not where it started. */
  private readonly rest = new Map<string, ToyPlace>();
  private readonly bells = new Set<string>();
  private readonly rings = new Set<string>();
  /** Something here has changed since this was last set to false: it wants saving. */
  changed = false;

  constructor(saved?: SharedWorld) {
    if (!saved) return;
    for (const [toy, player] of saved.holders) this.holders.set(toy, player);
    for (const [toy, member] of saved.sims) this.sims.set(toy, member);
    for (const [toy, target] of saved.placed) this.placed.set(toy, target);
    for (const [toy, at] of saved.rest) this.rest.set(toy, at);
    for (const bell of saved.bells) this.bells.add(bell);
    for (const ring of saved.rings) this.rings.add(ring);
  }

  get state(): SharedWorld {
    return {
      holders: [...this.holders],
      sims: [...this.sims],
      placed: [...this.placed],
      rest: [...this.rest],
      bells: [...this.bells],
      rings: [...this.rings],
    };
  }

  holderOf(toyId: string): string | null {
    return this.holders.get(toyId) ?? null;
  }

  restOf(toyId: string): ToyPlace | null {
    return this.rest.get(toyId) ?? null;
  }

  /**
   * An action from the game of member `memberId`, already known to be one
   * that game may speak for. `host` is true if that game answers for toys
   * nobody is moving. Returns whether it stands: if not, it is not passed on.
   */
  take(action: Action, memberId: string, host: boolean): boolean {
    const before = this.bells.size + this.rings.size;
    const stands = this.accept(action, memberId, host);
    // A bell rung twice, a splash or a stunt change nothing worth keeping.
    const toys = !['ring', 'passRing', 'celebrate', 'splash', 'stunt', 'chooseCharacter'].includes(action.type);
    if (stands && (toys || this.bells.size + this.rings.size !== before)) this.changed = true;
    return stands;
  }

  private accept(action: Action, memberId: string, host: boolean): boolean {
    switch (action.type) {
      case 'pickUp':
        // First come, first served.
        if (this.holders.has(action.toyId) || this.carriedBy(action.playerId)) return false;
        this.loose(action.toyId);
        this.holders.set(action.toyId, action.playerId);
        return true;
      case 'take': {
        const holder = this.holders.get(action.toyId);
        if (!holder || holder === action.playerId || this.carriedBy(action.playerId)) return false;
        this.holders.set(action.toyId, action.playerId);
        return true;
      }
      case 'drop': {
        const toy = this.carriedBy(action.playerId);
        if (!toy) return false;
        this.holders.delete(toy);
        // Whoever let go of it moves it until it comes to rest.
        this.sims.set(toy, memberId);
        return true;
      }
      case 'claim':
        if (this.holders.has(action.toyId) || this.sims.has(action.toyId)) return false;
        this.rest.delete(action.toyId);
        this.sims.set(action.toyId, memberId);
        return true;
      case 'rest':
        if (this.sims.get(action.toyId) !== memberId) return false;
        this.sims.delete(action.toyId);
        this.rest.set(action.toyId, action.at);
        return true;
      case 'place':
        if (this.holders.has(action.toyId) || !this.answersFor(action.toyId, memberId, host)) return false;
        this.placed.set(action.toyId, action.targetId);
        return true;
      case 'home':
        if (this.holders.has(action.toyId) || !this.answersFor(action.toyId, memberId, host)) return false;
        this.loose(action.toyId);
        return true;
      case 'eat':
        if (this.holders.has(action.toyId)) return false;
        this.loose(action.toyId);
        return true;
      case 'ring':
        this.bells.add(action.objectId);
        return true;
      case 'passRing':
        this.rings.add(action.ringId);
        return true;
      case 'celebrate':
        if (action.what === 'bells') this.bells.clear();
        else this.rings.clear();
        return true;
      case 'splash':
      case 'stunt':
      case 'chooseCharacter':
        return true;
    }
  }

  /**
   * A member has gone. The toys they carried, and those their game was
   * moving, go back to where they started; these are their ids.
   */
  leave(memberId: string): string[] {
    const toys: string[] = [];
    for (const [toy, player] of this.holders) if (player === memberId) toys.push(toy);
    for (const [toy, member] of this.sims) if (member === memberId) toys.push(toy);
    for (const toy of toys) {
      this.holders.delete(toy);
      this.loose(toy);
    }
    if (toys.length > 0) this.changed = true;
    return toys;
  }

  private carriedBy(playerId: string): string | null {
    for (const [toy, player] of this.holders) if (player === playerId) return toy;
    return null;
  }

  /** Whether a member's game is the one to say what a loose toy does. */
  private answersFor(toyId: string, memberId: string, host: boolean): boolean {
    const mover = this.sims.get(toyId);
    return mover ? mover === memberId : host;
  }

  /** Forget where a toy lay: it has been picked up, or has gone back to where it started. */
  private loose(toyId: string): void {
    this.sims.delete(toyId);
    this.placed.delete(toyId);
    this.rest.delete(toyId);
  }
}
