import { Group, Vector3 } from 'three';
import type { PetView, PlayerView as PlayerInfo } from '../../shared/api';
import type { Account, PetsApi } from '../account/account';
import type { FeatherBatch } from '../characters/FeatherBatch';
import { petCharacter } from '../characters/pets';
import type { VoiceDef } from '../characters/types';
import type { PhysicsWorld } from '../engine/physics';
import { HANDS } from '../player/Player';
import type { Player } from '../player/Player';
import { beakPosition } from '../world/beak';
import type { PetCornerDef, Stand } from '../world/types';
import { LivePet } from './LivePet';
import { PetCorner } from './PetCorner';
import type { PetTouch } from './PetCorner';
import { PetCornerView } from './PetCornerView';
import { StationsView } from './StationsView';

// A signed-in player's pets in the game: the pet corner where they sit, the
// one that follows the player about, breeding, the egg, and setting a pet
// free. What happens is the server's to say: a touch asks it, and nothing
// changes here until it has agreed.

/** How long both pads by the goodbye perch must be held to set a pet free. */
export const HOLD_TO_FREE = 3; // s
/** How often the server is asked what has changed: a friend's answer, a new request. */
const ASK_EVERY = 20; // s

export interface PetsDeps {
  physics: PhysicsWorld;
  /** Left out when there is nothing to draw with, as in tests. */
  feathers: FeatherBatch | null;
  /** The server. */
  api: PetsApi;
  /** The lobby's perching places, for a pet whose owner is somewhere it cannot land beside. */
  spots(): readonly Vector3[];
  /** Food dropped in the egg cup has been eaten: put the toy back where it started. */
  eat(toyId: string): void;
  /** Things worth a sound or a sparkle. */
  onEvent?(event: PetEvent): void;
}

export type PetEvent =
  /** A pet was chosen, and left its perch at `at`. */
  | { type: 'chosen'; at: Vector3 }
  /** Something could not be done, at `at`. */
  | { type: 'refused'; at: Vector3 }
  /** A pet got back to its perch at `at`, or one that was set free went out of sight there. */
  | { type: 'home'; at: Vector3 }
  /** Something good happened at `at`: an egg was laid, fed or hatched, a request made or answered. */
  | { type: 'cheer'; at: Vector3 }
  /** The follower landed by its owner and calls. */
  | { type: 'call'; voice: VoiceDef; at: Vector3 };

const at = (stand: Stand | { position: readonly [number, number, number] }, lift = 0): Vector3 =>
  new Vector3(stand.position[0], stand.position[1] + lift, stand.position[2]);

export class Pets {
  /** Add this to the scene: the pet corner and the pets that are out of it. */
  readonly object = new Group();
  corner: PetCorner | null = null;
  private rail: PetCornerView | null = null;
  private stations: StationsView | null = null;
  private account: Account = { status: 'out' };
  private live: LivePet[] = [];
  /** A request to the server is on its way; touches wait for its answer. */
  private busy = false;
  private feeding = false;
  private askIn = 0;
  private readonly points = [new Vector3(), new Vector3(), new Vector3()];

  constructor(private readonly deps: PetsDeps) {}

  /** The pets that are out flying. The one following, if any, is in `follow` mode. */
  get pets(): readonly LivePet[] {
    return this.live;
  }

  /** Set up the lobby's pet corner, if it has one. Call after the world has loaded the lobby. */
  load(def: PetCornerDef | undefined): void {
    if (!def) return;
    this.corner = new PetCorner(def);
    if (this.deps.feathers) {
      this.rail = new PetCornerView(this.corner);
      this.stations = new StationsView(this.corner);
      this.object.add(this.rail.object, this.stations.object);
    }
    this.setAccount(this.account);
  }

  /** Remove the pet corner and every pet. Call before the world forgets the lobby. */
  clear(): void {
    for (const pet of this.live) this.remove(pet);
    this.live = [];
    for (const view of [this.rail, this.stations]) {
      if (!view) continue;
      this.object.remove(view.object);
      view.dispose();
    }
    this.rail = this.stations = null;
    this.corner = null;
  }

  /**
   * Who is signed in has changed, or the server has given them back with a
   * change. `start` is where the follower sets out from if it is not out
   * already: `'beside'` its owner, or a place such as the perch it was
   * touched on.
   */
  setAccount(account: Account, start: Vector3 | 'beside' = 'beside'): void {
    const wasIn = this.account.status === 'in';
    this.account = account;
    const corner = this.corner;
    if (!corner) return;

    // Pets the change takes off a heart perch or the goodbye perch go back where they belong.
    const sat = this.sitting(corner);
    corner.setAccount(account);
    const followerId = corner.player?.followerId ?? null;
    for (const [petId, from] of sat) {
      if (corner.isOut(petId) || !corner.pet(petId)) continue;
      if (petId === followerId) start = from;
      else this.flyHome(corner, petId, from);
    }
    this.sync(corner, start);
    // Somebody has just signed in: hear about their friends straight away.
    if (!wasIn && account.status === 'in') this.askIn = 0;
  }

  /** One fixed simulation step for the pets that are out. `owner` is the player they belong to. */
  step(dt: number, owner: Player | null): void {
    const corner = this.corner;
    if (!corner) return;
    const done: LivePet[] = [];
    for (const pet of this.live) {
      pet.step(dt, owner);
      if (pet.arrived) this.deps.onEvent?.({ type: 'call', voice: pet.def.voice, at: pet.position });
      if (pet.mode === 'home' && pet.atHome) done.push(pet);
    }
    if (done.length === 0) return;
    for (const pet of done) {
      const where = pet.leaving ? pet.position.clone() : at(corner.def.perches[Math.max(0, corner.perchOf(pet.petId))], 0.15);
      this.remove(pet);
      this.deps.onEvent?.({ type: 'home', at: where });
    }
    this.live = this.live.filter((pet) => !done.includes(pet));
    this.refresh(corner);
  }

  /**
   * Once per drawn frame, with fresh head and hand poses: draw the pets, and
   * see what the player has touched. Call between the feather batch's `begin`
   * and `end`.
   */
  frame(dt: number, alpha: number, owner: Player | null): void {
    for (const pet of this.live) pet.frame(dt, alpha);
    this.rail?.update(dt);
    this.stations?.update(dt);

    const corner = this.corner;
    if (!corner || !corner.player) return;
    this.askIn -= dt;
    if (this.askIn <= 0 && !this.busy) {
      this.askIn = ASK_EVERY;
      void this.hear(corner);
    }
    if (!owner || this.busy) return;

    beakPosition(owner.head, this.points[0]);
    HANDS.forEach((h, i) => this.points[i + 1].copy(owner.hands[h].grip.position));
    const touch = corner.touched(this.points);
    if (touch) this.handle(corner, touch);
    else this.hold(corner, dt);
  }

  /**
   * A toy has come to rest in a place. Food in the egg cup is eaten, and
   * feeds the egg if there is one.
   */
  onPlaced(toyId: string, targetId: string): void {
    const corner = this.corner;
    if (!corner || targetId !== corner.def.eggCup.targetId) return;
    this.deps.eat(toyId);
    if (!corner.egg || this.feeding) return;
    this.feeding = true;
    void this.deps.api.feed().then((fed) => {
      this.feeding = false;
      if (this.corner !== corner) return;
      const cup = at(corner.def.eggCup, 0.15);
      if (!fed) {
        this.deps.onEvent?.({ type: 'refused', at: cup });
        return;
      }
      this.setAccount({ status: 'in', player: fed.player });
      this.deps.onEvent?.({ type: 'cheer', at: cup });
      const baby = fed.hatched && corner.pet(fed.hatched);
      // The baby flies from the cup to its place on the rail.
      if (baby) this.flyHome(corner, baby.id, cup);
      else this.stations?.rock();
      this.refresh(corner);
    });
  }

  // --- Touches -----------------------------------------------------------------

  private handle(corner: PetCorner, touch: PetTouch): void {
    const { def } = corner;
    switch (touch.kind) {
      case 'page':
        corner.turn(touch.turn);
        return this.refresh(corner);
      case 'friendPage':
        corner.turnFriends(touch.turn);
        return this.refresh(corner);
      case 'pet': {
        const perch = at(def.perches[touch.slot]);
        return this.ask(corner, this.deps.api.follow(touch.pet.id), at(def.perches[touch.slot], 0.15), {
          start: perch,
          event: 'chosen',
          otherwise: () => this.rail?.shake(touch.slot),
        });
      }
      case 'answer':
        return this.ask(
          corner,
          this.deps.api.answer(touch.request.id, touch.accept),
          at(touch.accept ? def.mail.yes : def.mail.no),
        );
      case 'heart':
        return this.touchHeart(corner, touch.index);
      case 'friendPet': {
        const where = at(def.board.places[touch.place], 0.1);
        const mine = corner.heartSlots().filter((slot) => slot.kind === 'mine');
        // One of the player's own pets must be waiting on a heart perch for a partner.
        if (mine.length !== 1 || corner.asking || corner.egg || corner.full) return this.refuse(where);
        return this.ask(corner, this.deps.api.ask(mine[0].pet.id, touch.pet.id), where);
      }
      case 'goodbye': {
        const perch = at(def.goodbye.perch);
        const sitting = corner.placed.goodbye;
        if (sitting) {
          corner.placed.goodbye = null;
          corner.held = 0;
          return this.sync(corner, perch);
        }
        const follower = this.follower();
        if (!follower) return this.refuse(at(def.goodbye.perch, 0.15));
        corner.placed.goodbye = follower.petId;
        return this.sync(corner);
      }
    }
  }

  private touchHeart(corner: PetCorner, index: 0 | 1): void {
    const stand = corner.def.hearts[index];
    const where = at(stand, 0.15);
    const slot = corner.heartSlots()[index];
    const asking = corner.asking;

    if (slot.kind === 'theirs' && asking) {
      // Touching the friend's pet takes the request back. The player's own pet stays for another try.
      return this.ask(corner, this.deps.api.cancel(asking.id), where, { event: 'home' });
    }
    if (slot.kind === 'mine') {
      const off = (): void => {
        corner.placed.hearts[index] = null;
        this.sendBack(corner, slot.pet.id, at(stand));
      };
      // Taking the pet off its perch takes back the request made with it, too.
      if (asking) return this.ask(corner, this.deps.api.cancel(asking.id), where, { event: 'home', then: off });
      return off();
    }

    const follower = this.follower();
    if (!follower || corner.egg || asking || corner.full) return this.refuse(where);
    corner.placed.hearts[index] = follower.petId;
    this.sync(corner);
    const [a, b] = corner.placed.hearts;
    if (!a || !b) return;
    // Both perches hold one of the player's pets: they make an egg.
    this.ask(corner, this.deps.api.breed(a, b), at(corner.def.eggCup, 0.15), {
      otherwise: () => {
        corner.placed.hearts[index] = null;
        this.sendBack(corner, follower.petId, at(stand));
      },
    });
  }

  /** While a pet sits on the goodbye perch, holding both pads long enough sets it free. */
  private hold(corner: PetCorner, dt: number): void {
    const petId = corner.placed.goodbye;
    const pet = corner.pet(petId);
    if (!pet || !corner.padsHeld(this.points)) {
      corner.held = 0;
      return;
    }
    corner.held = Math.min(1, corner.held + dt / HOLD_TO_FREE);
    if (corner.held < 1) return;

    const perch = at(corner.def.goodbye.perch);
    this.ask(corner, this.deps.api.free(pet.id), at(corner.def.goodbye.perch, 0.15), {
      then: () => this.flyAway(corner, pet, perch),
      otherwise: () => (corner.held = 0),
    });
  }

  /**
   * Ask the server for a change, and act on its answer. On a yes the player
   * is taken as the server gives them and `event` is told; on a no, or with
   * no answer, a "no" is told at `where` and nothing changes.
   */
  private ask(
    corner: PetCorner,
    call: Promise<PlayerInfo | null>,
    where: Vector3,
    options: { start?: Vector3; event?: 'chosen' | 'cheer' | 'home'; then?(): void; otherwise?(): void } = {},
  ): void {
    this.busy = true;
    void call.then((player) => {
      this.busy = false;
      // The lobby may have been left while the server was thinking.
      if (this.corner !== corner) return;
      if (!player) {
        options.otherwise?.();
        this.refresh(corner);
        return this.refuse(where);
      }
      this.setAccount({ status: 'in', player }, options.start);
      options.then?.();
      this.deps.onEvent?.({ type: options.event ?? 'cheer', at: where });
    });
  }

  private refuse(where: Vector3): void {
    this.deps.onEvent?.({ type: 'refused', at: where });
  }

  // --- Pets that are out flying --------------------------------------------------

  /** The pet that is following the player, if it is out. */
  private follower(): LivePet | undefined {
    return this.live.find((pet) => pet.mode === 'follow' && !pet.leaving);
  }

  /** Each of the player's pets that sits on a heart perch or the goodbye perch, and where. */
  private sitting(corner: PetCorner): [string, Vector3][] {
    const { placed, def } = corner;
    const sat: [string, Vector3][] = [];
    placed.hearts.forEach((id, i) => id && sat.push([id, at(def.hearts[i])]));
    if (placed.goodbye) sat.push([placed.goodbye, at(def.goodbye.perch)]);
    return sat;
  }

  /** A pet that has come off a heart perch: it follows again if it is the follower, or else flies home. */
  private sendBack(corner: PetCorner, petId: string, from: Vector3): void {
    if (petId === corner.player?.followerId) this.sync(corner, from);
    else {
      this.flyHome(corner, petId, from);
      this.refresh(corner);
    }
  }

  /**
   * Make the pets that are out match what the corner now holds: the follower
   * is out and following unless it sits on a perch, a pet that follows no
   * longer flies home, and a pet that is not the player's any more is gone.
   */
  private sync(corner: PetCorner, start: Vector3 | 'beside' = 'beside'): void {
    const followerId = corner.player?.followerId ?? null;
    const keep: LivePet[] = [];
    for (const pet of this.live) {
      const sits = corner.placed.hearts.includes(pet.petId) || corner.placed.goodbye === pet.petId;
      if (pet.leaving) keep.push(pet);
      else if (!corner.pet(pet.petId) || sits) this.remove(pet);
      else {
        if (pet.petId === followerId) {
          // Called back, perhaps before it got home.
          pet.mode = 'follow';
          pet.atHome = false;
        } else pet.mode = 'home';
        keep.push(pet);
      }
    }
    this.live = keep;

    const follower = corner.pet(followerId);
    const sits = follower && (corner.placed.hearts.includes(follower.id) || corner.placed.goodbye === follower.id);
    if (follower && !sits && !this.live.some((pet) => pet.petId === follower.id && !pet.leaving)) {
      this.live.push(this.fly(corner, follower, start));
    }
    this.refresh(corner);
  }

  /** Bring a pet out, flying. */
  private fly(corner: PetCorner, pet: PetView, start: Vector3 | 'beside'): LivePet {
    const out = new LivePet(
      pet.id,
      petCharacter(pet.id, pet.dna),
      at(corner.def.perches[Math.max(0, corner.perchOf(pet.id))]),
      this.deps.physics,
      this.deps.feathers,
      this.deps.spots,
      start,
    );
    if (out.view) this.object.add(out.view.object);
    return out;
  }

  /** A pet flies from somewhere in the corner to its place on the rail. */
  private flyHome(corner: PetCorner, petId: string, from: Vector3): void {
    const pet = corner.pet(petId);
    if (!pet || this.live.some((out) => out.petId === petId)) return;
    const out = this.fly(corner, pet, from);
    out.mode = 'home';
    this.live.push(out);
  }

  /** A pet that has just been set free flies up and away from the nest, and is gone. */
  private flyAway(corner: PetCorner, pet: PetView, from: Vector3): void {
    const away = new Vector3(from.x, 0, from.z).normalize().multiplyScalar(22).add(from);
    away.y = from.y + 9;
    const out = new LivePet(pet.id, petCharacter(pet.id, pet.dna), away, this.deps.physics, this.deps.feathers, this.deps.spots, from);
    out.mode = 'home';
    out.leaving = true;
    if (out.view) this.object.add(out.view.object);
    this.live.push(out);
    this.refresh(corner);
  }

  /** Ask the server what has changed: a friend's answer, a new request, the friends' pets. */
  private async hear(corner: PetCorner): Promise<void> {
    const [account, friends] = await Promise.all([this.deps.api.account(), this.deps.api.friends()]);
    // An answer that comes back late, or while something else is being asked, is dropped.
    if (this.corner !== corner || this.busy || this.feeding) return;
    if (friends) corner.setFriends(friends);
    // With no connection the game carries on with what it last knew.
    if (account.status !== 'offline') this.setAccount(account);
    else this.refresh(corner);
  }

  /** Tell the corner which pets are out flying, and redraw it. */
  private refresh(corner: PetCorner): void {
    corner.away.clear();
    for (const pet of this.live) if (!pet.leaving) corner.away.add(pet.petId);
    this.rail?.rebuild();
    this.stations?.rebuild();
  }

  private remove(pet: LivePet): void {
    if (!pet.view) return;
    this.object.remove(pet.view.object);
    pet.view.dispose();
  }
}
