import { Vector3 } from 'three';
import type { PetView } from '../../shared/api';
import type { Account } from '../account/account';
import type { PetCornerDef } from '../world/types';

// What the pet corner holds and how it is touched. No drawing and no server
// calls in here, so it can be tested on its own.

/** How close a beak or hand must come to the middle of a pet or an arrow to touch it. */
export const PET_TOUCH = 0.2; // m
/** About how high the middle of a perched pet is above its feet. */
const PET_MIDDLE = 0.15; // m

/** What a player has just touched. */
export type PetTouch =
  | { kind: 'pet'; pet: PetView; slot: number }
  /** An arrow, to turn to the page before (-1) or after (1). */
  | { kind: 'page'; turn: -1 | 1 };

export class PetCorner {
  account: Account = { status: 'out' };
  /** The page of pets showing, from 0. */
  page = 0;
  /** Pets that are out of the corner: following the player, or flying home. */
  readonly away = new Set<string>();

  private readonly middles: Vector3[];
  private readonly arrows: Record<'previous' | 'next', Vector3>;
  /** What is being touched now, so that one touch counts once however long it lasts. */
  private readonly touching = new Set<string>();

  constructor(readonly def: PetCornerDef) {
    this.middles = def.perches.map(({ position: [x, y, z] }) => new Vector3(x, y + PET_MIDDLE, z));
    this.arrows = {
      previous: new Vector3(...def.previous.position),
      next: new Vector3(...def.next.position),
    };
  }

  /** The signed-in player's hatched pets, in the order they were got. */
  get pets(): PetView[] {
    return this.account.status === 'in' ? this.account.player.pets.filter((pet) => pet.stage === 'hatched') : [];
  }

  get pages(): number {
    return Math.max(1, Math.ceil(this.pets.length / this.def.perches.length));
  }

  /** Who is on each perch of the page showing. An empty perch, or one whose pet is away, is null. */
  slots(): (PetView | null)[] {
    const perPage = this.def.perches.length;
    const onPage = this.pets.slice(this.page * perPage, (this.page + 1) * perPage);
    return this.def.perches.map((_, i) => (onPage[i] && !this.away.has(onPage[i].id) ? onPage[i] : null));
  }

  /** The perch a pet belongs on, whichever page it is on; -1 if it is not the player's. */
  perchOf(petId: string): number {
    const index = this.pets.findIndex((pet) => pet.id === petId);
    return index < 0 ? -1 : index % this.def.perches.length;
  }

  setAccount(account: Account): void {
    this.account = account;
    this.page = Math.min(this.page, this.pages - 1);
  }

  /** Turn to the page before or after, going round at the ends. */
  turn(by: -1 | 1): void {
    this.page = (this.page + by + this.pages) % this.pages;
  }

  /**
   * What the player has newly touched. `points` are their beak and hands.
   * Staying on something does not touch it again; the point must leave first.
   */
  touched(points: readonly Vector3[]): PetTouch | null {
    const near = (middle: Vector3): boolean => points.some((point) => point.distanceTo(middle) < PET_TOUCH);
    /** True the first time `key` is found touched. */
    const fresh = (key: string, isNear: boolean): boolean => {
      if (!isNear) {
        this.touching.delete(key);
        return false;
      }
      if (this.touching.has(key)) return false;
      this.touching.add(key);
      return true;
    };

    let found: PetTouch | null = null;
    this.slots().forEach((pet, slot) => {
      // Keyed by the pet, so a new pet on the same perch can be touched at once.
      if (fresh(`pet:${pet?.id ?? slot}`, !!pet && near(this.middles[slot])) && pet) found ??= { kind: 'pet', pet, slot };
    });
    for (const [which, turn] of [['previous', -1], ['next', 1]] as const) {
      if (fresh(which, this.pages > 1 && near(this.arrows[which]))) found ??= { kind: 'page', turn };
    }
    return found;
  }
}
