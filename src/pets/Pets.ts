import { Group, Vector3 } from 'three';
import type { PlayerView as PlayerInfo } from '../../shared/api';
import type { Account } from '../account/account';
import type { FeatherBatch } from '../characters/FeatherBatch';
import { petCharacter } from '../characters/pets';
import type { VoiceDef } from '../characters/types';
import type { PhysicsWorld } from '../engine/physics';
import { HANDS } from '../player/Player';
import type { Player } from '../player/Player';
import { beakPosition } from '../world/beak';
import type { PetCornerDef } from '../world/types';
import { LivePet } from './LivePet';
import { PetCorner } from './PetCorner';
import { PetCornerView } from './PetCornerView';

// A signed-in player's pets in the game: the pet corner where they sit, and
// the one that follows the player about. Which pet follows is the server's to
// say: a touch asks it, and nothing changes here until it has agreed.

export interface PetsDeps {
  physics: PhysicsWorld;
  /** Left out when there is nothing to draw with, as in tests. */
  feathers: FeatherBatch | null;
  /** Ask the server to make a pet the follower. Gives the player as the server now has them, or null. */
  follow(petId: string): Promise<PlayerInfo | null>;
  /** The lobby's perching places, for a pet whose owner is somewhere it cannot land beside. */
  spots(): readonly Vector3[];
  /** Things worth a sound or a sparkle. */
  onEvent?(event: PetEvent): void;
}

export type PetEvent =
  /** A pet was chosen, and left its perch at `at`. */
  | { type: 'chosen'; at: Vector3 }
  /** The server said no to the pet on the perch at `at`. */
  | { type: 'refused'; at: Vector3 }
  /** A pet got back to its perch at `at`. */
  | { type: 'home'; at: Vector3 }
  /** The follower landed by its owner and calls. */
  | { type: 'call'; voice: VoiceDef; at: Vector3 };

export class Pets {
  /** Add this to the scene: the pet corner and the pets that are out of it. */
  readonly object = new Group();
  corner: PetCorner | null = null;
  private view: PetCornerView | null = null;
  private account: Account = { status: 'out' };
  private live: LivePet[] = [];
  /** A request to the server is on its way; touches wait for its answer. */
  private asking = false;
  private readonly points = [new Vector3(), new Vector3(), new Vector3()];
  private readonly at = new Vector3();

  constructor(private readonly deps: PetsDeps) {}

  /** The pets out of the corner. The one following, if any, is in `follow` mode. */
  get pets(): readonly LivePet[] {
    return this.live;
  }

  /** Set up the lobby's pet corner, if it has one. Call after the world has loaded the lobby. */
  load(def: PetCornerDef | undefined): void {
    if (!def) return;
    this.corner = new PetCorner(def);
    if (this.deps.feathers) {
      this.view = new PetCornerView(this.corner);
      this.object.add(this.view.object);
    }
    this.setAccount(this.account);
  }

  /** Remove the pet corner and every pet. Call before the world forgets the lobby. */
  clear(): void {
    for (const pet of this.live) this.remove(pet);
    this.live = [];
    if (this.view) {
      this.object.remove(this.view.object);
      this.view.dispose();
    }
    this.view = null;
    this.corner = null;
  }

  /**
   * Who is signed in has changed, or the server has given them back with a
   * change. `chosen` is true when the change is the player having just
   * touched the pet that now follows.
   */
  setAccount(account: Account, chosen = false): void {
    this.account = account;
    const corner = this.corner;
    if (!corner) return;
    corner.setAccount(account);

    const followerId = account.status === 'in' ? account.player.followerId : null;
    for (const pet of this.live) {
      // A pet that is no longer the player's goes at once; one no longer following flies home.
      if (corner.perchOf(pet.petId) < 0) this.remove(pet);
      else if (pet.petId !== followerId) pet.mode = 'home';
    }
    this.live = this.live.filter((pet) => corner.perchOf(pet.petId) >= 0);

    const follower = followerId ? corner.pets.find((pet) => pet.id === followerId) : undefined;
    const out = this.live.find((pet) => pet.petId === followerId);
    if (out) {
      // Called back before it got home.
      out.mode = 'follow';
      out.atHome = false;
    } else if (follower) {
      const [x, y, z] = corner.def.perches[corner.perchOf(follower.id)].position;
      const pet = new LivePet(
        follower.id,
        petCharacter(follower.id, follower.dna),
        new Vector3(x, y, z),
        this.deps.physics,
        this.deps.feathers,
        this.deps.spots,
        chosen,
      );
      if (pet.view) this.object.add(pet.view.object);
      this.live.push(pet);
    }
    this.refresh();
  }

  /** One fixed simulation step for the pets that are out. `owner` is the player they belong to. */
  step(dt: number, owner: Player | null): void {
    const corner = this.corner;
    if (!corner) return;
    let changed = false;
    for (const pet of this.live) {
      pet.step(dt, owner);
      if (pet.arrived) this.deps.onEvent?.({ type: 'call', voice: pet.def.voice, at: pet.position });
      if (pet.mode === 'home' && pet.atHome) {
        this.remove(pet);
        this.deps.onEvent?.({ type: 'home', at: this.perchAt(corner.perchOf(pet.petId)) });
        changed = true;
      }
    }
    if (changed) {
      this.live = this.live.filter((pet) => !(pet.mode === 'home' && pet.atHome));
      this.refresh();
    }
  }

  /**
   * Once per drawn frame, with fresh head and hand poses: draw the pets, and
   * see whether the player has touched a pet or an arrow. Call between the
   * feather batch's `begin` and `end`.
   */
  frame(dt: number, alpha: number, owner: Player | null): void {
    for (const pet of this.live) pet.frame(dt, alpha);
    this.view?.update(dt);

    const corner = this.corner;
    if (!corner || !owner || this.asking) return;
    beakPosition(owner.head, this.points[0]);
    HANDS.forEach((h, i) => this.points[i + 1].copy(owner.hands[h].grip.position));
    const touch = corner.touched(this.points);
    if (!touch) return;
    if (touch.kind === 'page') {
      corner.turn(touch.turn);
      this.view?.rebuild();
      return;
    }

    const { pet, slot } = touch;
    this.asking = true;
    void this.deps.follow(pet.id).then((player) => {
      this.asking = false;
      // The lobby may have been left while the server was thinking.
      if (this.corner !== corner) return;
      if (player) {
        this.setAccount({ status: 'in', player }, true);
        this.deps.onEvent?.({ type: 'chosen', at: this.perchAt(slot) });
      } else {
        this.view?.shake(slot);
        this.deps.onEvent?.({ type: 'refused', at: this.perchAt(slot) });
      }
    });
  }

  /** The middle of the pet on a perch, for a sparkle. */
  private perchAt(slot: number): Vector3 {
    const stand = this.corner?.def.perches[slot];
    return stand ? this.at.set(...stand.position).setY(stand.position[1] + 0.15) : this.at.set(0, 0, 0);
  }

  /** Tell the corner which pets are out of it, and redraw it. */
  private refresh(): void {
    const corner = this.corner;
    if (!corner) return;
    corner.away.clear();
    for (const pet of this.live) corner.away.add(pet.petId);
    this.view?.rebuild();
  }

  private remove(pet: LivePet): void {
    if (!pet.view) return;
    this.object.remove(pet.view.object);
    pet.view.dispose();
  }
}
