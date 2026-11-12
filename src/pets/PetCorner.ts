import { Vector3 } from 'three';
import { PET_CAP } from '../../shared/api';
import type { EggView, FriendView, PetView, PlayerView, RequestView } from '../../shared/api';
import type { Account } from '../account/account';
import type { PetCornerDef, Stand } from '../world/types';

// What the pet corner holds and how it is touched: the player's pets on the
// rail, the two heart perches and the egg between them, the friends' board, a
// friend's request to answer, and the goodbye perch. No drawing and no server
// calls in here, so it can be tested on its own.

/** How close a beak or hand must come to the middle of a pet to touch it. */
export const PET_TOUCH = 0.2; // m
/** The same for smaller things: a friend's pet on the board, an arrow there, a pad. */
export const SMALL_TOUCH = 0.15; // m
/** About how high the middle of a perched pet is above its feet. */
const PET_MIDDLE = 0.15; // m
/** Friends' pets are shown smaller than the player's own. */
export const BOARD_PET_SIZE = 0.65;

/** What a player has just touched. */
export type PetTouch =
  | { kind: 'pet'; pet: PetView; slot: number }
  /** An arrow on the rail, to turn to the page before (-1) or after (1). */
  | { kind: 'page'; turn: -1 | 1 }
  | { kind: 'heart'; index: 0 | 1 }
  | { kind: 'friendPet'; pet: PetView; place: number }
  | { kind: 'friendPage'; turn: -1 | 1 }
  /** A pad under a friend's request: yes or no. */
  | { kind: 'answer'; request: RequestView; accept: boolean }
  | { kind: 'goodbye' };

/** What is on a heart perch: nothing, one of the player's pets, or a friend's pet that has been asked for. */
export type HeartSlot = { kind: 'empty' } | { kind: 'mine'; pet: PetView } | { kind: 'theirs'; pet: PetView };

const middle = (stand: Stand, lift = PET_MIDDLE): Vector3 =>
  new Vector3(stand.position[0], stand.position[1] + lift, stand.position[2]);

export class PetCorner {
  account: Account = { status: 'out' };
  /** The page of the player's pets showing on the rail, from 0. */
  page = 0;
  /** Pets that are out flying: following the player, going home, or leaving. Set by Pets. */
  readonly away = new Set<string>();
  /**
   * The player's own pets that sit somewhere other than the rail. Only the
   * game knows this; the server is told when it leads to something.
   */
  readonly placed: { hearts: [string | null, string | null]; goodbye: string | null } = {
    hearts: [null, null],
    goodbye: null,
  };
  /** The other players, as last heard from the server. */
  friends: FriendView[] = [];
  /** The page of the friends' board showing, from 0. */
  friendPage = 0;
  /** How far the two pads have been held toward setting the pet on the goodbye perch free: 0 to 1. */
  held = 0;

  private readonly spots: {
    perches: Vector3[];
    hearts: Vector3[];
    places: Vector3[];
    goodbye: Vector3;
    pads: Vector3[];
    at: Record<'previous' | 'next' | 'friendsBefore' | 'friendsAfter' | 'yes' | 'no', Vector3>;
  };
  /** What is being touched now, so that one touch counts once however long it lasts. */
  private readonly touching = new Set<string>();

  constructor(readonly def: PetCornerDef) {
    this.spots = {
      perches: def.perches.map((stand) => middle(stand)),
      hearts: def.hearts.map((stand) => middle(stand)),
      places: def.board.places.map((stand) => middle(stand, PET_MIDDLE * BOARD_PET_SIZE)),
      goodbye: middle(def.goodbye.perch),
      pads: def.goodbye.pads.map((stand) => middle(stand, 0)),
      at: {
        previous: middle(def.previous, 0),
        next: middle(def.next, 0),
        friendsBefore: middle(def.board.previous, 0),
        friendsAfter: middle(def.board.next, 0),
        yes: middle(def.mail.yes, 0),
        no: middle(def.mail.no, 0),
      },
    };
  }

  /** The signed-in player, or null. */
  get player(): PlayerView | null {
    return this.account.status === 'in' ? this.account.player : null;
  }

  /** The signed-in player's hatched pets, in the order they were got. */
  get pets(): PetView[] {
    return this.player?.pets ?? [];
  }

  get egg(): EggView | null {
    return this.player?.egg ?? null;
  }

  /** The DNA the player has asked a friend for, and not yet been answered. */
  get asking(): RequestView | null {
    return this.player?.asking ?? null;
  }

  /** The friend's request the player should answer next, if there is one. */
  get mail(): RequestView | null {
    return this.player?.asked[0] ?? null;
  }

  /** No room for another egg: the heart perches are closed. */
  get full(): boolean {
    return this.pets.length >= PET_CAP;
  }

  /** The player's pet with this id, or null. */
  pet(id: string | null): PetView | null {
    return (id && this.pets.find((pet) => pet.id === id)) || null;
  }

  // --- The rail ----------------------------------------------------------------

  get pages(): number {
    return Math.max(1, Math.ceil(this.pets.length / this.def.perches.length));
  }

  /** Whether a pet is off the rail: out flying, or sitting somewhere else in the corner. */
  isOut(petId: string): boolean {
    return this.away.has(petId) || this.placed.hearts.includes(petId) || this.placed.goodbye === petId;
  }

  /** Who is on each perch of the page showing. An empty perch, or one whose pet is out, is null. */
  slots(): (PetView | null)[] {
    const perPage = this.def.perches.length;
    const onPage = this.pets.slice(this.page * perPage, (this.page + 1) * perPage);
    return this.def.perches.map((_, i) => (onPage[i] && !this.isOut(onPage[i].id) ? onPage[i] : null));
  }

  /** The perch a pet belongs on, whichever page it is on; -1 if it is not the player's. */
  perchOf(petId: string): number {
    const index = this.pets.findIndex((pet) => pet.id === petId);
    return index < 0 ? -1 : index % this.def.perches.length;
  }

  /** Turn the rail to the page before or after, going round at the ends. */
  turn(by: -1 | 1): void {
    this.page = (this.page + by + this.pages) % this.pages;
  }

  // --- The heart perches -------------------------------------------------------

  /** What is on each heart perch. A friend's pet that has been asked for takes the free one. */
  heartSlots(): [HeartSlot, HeartSlot] {
    const slots = this.placed.hearts.map((id): HeartSlot => {
      const pet = this.pet(id);
      return pet ? { kind: 'mine', pet } : { kind: 'empty' };
    }) as [HeartSlot, HeartSlot];
    const asking = this.asking;
    const free = slots.findIndex((slot) => slot.kind === 'empty');
    if (asking && free >= 0) slots[free] = { kind: 'theirs', pet: asking.theirPet };
    return slots;
  }

  // --- The friends' board ------------------------------------------------------

  /** The board's pages: each friend who has pets, a board-full at a time. */
  friendPages(): { friend: FriendView; pets: PetView[] }[] {
    const perPage = this.def.board.places.length;
    const pages: { friend: FriendView; pets: PetView[] }[] = [];
    for (const friend of this.friends) {
      for (let i = 0; i < friend.pets.length; i += perPage) {
        pages.push({ friend, pets: friend.pets.slice(i, i + perPage) });
      }
    }
    return pages;
  }

  /** The page of the board showing, or null when there are no friends with pets. */
  friendShowing(): { friend: FriendView; pets: PetView[] } | null {
    const pages = this.friendPages();
    return pages[Math.min(this.friendPage, pages.length - 1)] ?? null;
  }

  turnFriends(by: -1 | 1): void {
    const pages = Math.max(1, this.friendPages().length);
    this.friendPage = (this.friendPage + by + pages) % pages;
  }

  // --- Changes -----------------------------------------------------------------

  /** Who is signed in has changed, or the server has given them back with a change. */
  setAccount(account: Account): void {
    this.account = account;
    this.page = Math.min(this.page, this.pages - 1);
    if (!this.player) {
      this.friends = [];
      this.friendPage = 0;
    }

    const { placed } = this;
    // Nothing sits anywhere that is no longer the player's pet.
    placed.hearts = placed.hearts.map((id) => (this.pet(id) ? id : null)) as [string | null, string | null];
    if (!this.pet(placed.goodbye)) placed.goodbye = null;
    if (!placed.goodbye) this.held = 0;

    const asking = this.asking;
    if (asking) {
      // The pet the request is for sits on a heart perch, and no other of the player's does.
      const at = placed.hearts.indexOf(asking.myPetId);
      placed.hearts = at === 1 ? [null, asking.myPetId] : [asking.myPetId, null];
      if (placed.goodbye === asking.myPetId) placed.goodbye = null;
    } else if (this.egg) {
      // The egg is laid: its parents go back to the rail.
      placed.hearts = [null, null];
    }
  }

  /** The friends, as the server now has them. */
  setFriends(friends: FriendView[]): void {
    this.friends = friends.filter((friend) => friend.pets.length > 0);
    this.friendPage = Math.min(this.friendPage, Math.max(0, this.friendPages().length - 1));
  }

  // --- Touching ----------------------------------------------------------------

  /**
   * What the player has newly touched. `points` are their beak and hands.
   * Staying on something does not touch it again; the point must leave first.
   */
  touched(points: readonly Vector3[]): PetTouch | null {
    if (!this.player) return null;
    const { spots } = this;
    let found: PetTouch | null = null;
    /** Note `touch` if something is newly within `reach` of `at`. `on` is false for a thing that is not there. */
    const check = (key: string, on: boolean, at: Vector3, reach: number, touch: () => PetTouch): void => {
      if (!on || !points.some((point) => point.distanceTo(at) < reach)) {
        this.touching.delete(key);
        return;
      }
      if (this.touching.has(key)) return;
      this.touching.add(key);
      found ??= touch();
    };

    const mail = this.mail;
    check('yes', !!mail, spots.at.yes, SMALL_TOUCH, () => ({ kind: 'answer', request: mail!, accept: true }));
    check('no', !!mail, spots.at.no, SMALL_TOUCH, () => ({ kind: 'answer', request: mail!, accept: false }));

    // Keyed by the pet, so a new pet on the same perch can be touched at once.
    this.slots().forEach((pet, slot) =>
      check(`pet:${pet?.id ?? slot}`, !!pet, spots.perches[slot], PET_TOUCH, () => ({ kind: 'pet', pet: pet!, slot })),
    );
    const paged = this.pages > 1;
    check('previous', paged, spots.at.previous, PET_TOUCH, () => ({ kind: 'page', turn: -1 }));
    check('next', paged, spots.at.next, PET_TOUCH, () => ({ kind: 'page', turn: 1 }));

    for (const index of [0, 1] as const) {
      check(`heart:${index}`, true, spots.hearts[index], PET_TOUCH, () => ({ kind: 'heart', index }));
    }

    const showing = this.friendShowing();
    spots.places.forEach((at, place) => {
      const pet = showing?.pets[place];
      check(`friend:${pet?.id ?? place}`, !!pet, at, SMALL_TOUCH, () => ({ kind: 'friendPet', pet: pet!, place }));
    });
    const friendsPaged = this.friendPages().length > 1;
    check('friendsBefore', friendsPaged, spots.at.friendsBefore, SMALL_TOUCH, () => ({ kind: 'friendPage', turn: -1 }));
    check('friendsAfter', friendsPaged, spots.at.friendsAfter, SMALL_TOUCH, () => ({ kind: 'friendPage', turn: 1 }));

    check('goodbye', true, spots.goodbye, PET_TOUCH, () => ({ kind: 'goodbye' }));
    return found;
  }

  /** Whether a hand, or the beak, is on each of the two pads by the goodbye perch. */
  padsHeld(points: readonly Vector3[]): boolean {
    return this.spots.pads.every((pad) => points.some((point) => point.distanceTo(pad) < SMALL_TOUCH));
  }
}
