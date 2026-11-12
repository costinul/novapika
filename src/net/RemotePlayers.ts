import { Group } from 'three';
import type { Vector3 } from 'three';
import type { PetView } from '../../shared/api';
import type { LobbyPlayer } from '../../shared/net';
import type { FeatherBatch } from '../characters/FeatherBatch';
import { petCharacter } from '../characters/pets';
import { DEFAULT_CHARACTER, roster } from '../characters/roster';
import { Player } from '../player/Player';
import { PlayerView } from '../player/PlayerView';
import type { WorldState } from '../world/WorldState';
import { PoseTrack } from './pose';

interface Shown {
  player: Player;
  view: PlayerView | null;
  track: PoseTrack;
}

interface Remote extends Shown {
  info: LobbyPlayer;
  /** The pet following them, once it has been seen to move. */
  follower: (Shown & { petId: string }) | null;
}

/** A follower that has not been heard from for this long has gone home. */
const FOLLOWER_GONE_AFTER = 2; // s

/**
 * The other people in the lobby. Each is an ordinary Player, so the world,
 * the lobby's parrots and the drawing treat them like anyone else; but their
 * game runs them, and here they are only moved to where it says they are.
 */
export class RemotePlayers {
  /** Add this to the scene: the other players' models. */
  readonly object = new Group();
  private readonly bySlot = new Map<number, Remote>();

  constructor(
    private readonly world: WorldState,
    /** Left out when there is nothing to draw with, as in tests. */
    private readonly feathers: FeatherBatch | null,
    /** A pet of another player's, as the server last told it; null if it has not been heard of. */
    private readonly petOf: (ownerId: string, petId: string) => PetView | null,
  ) {}

  /** Where the head of the player in `slot` is, or null if they have not been seen to move yet. */
  headOf(slot: number): Vector3 | null {
    const remote = this.bySlot.get(slot);
    return remote?.track.started ? remote.player.head.position : null;
  }

  /** Somebody is in the lobby, or has changed parrot. True if they were not known before. */
  set(info: LobbyPlayer): boolean {
    const characterId = info.characterId in roster ? info.characterId : DEFAULT_CHARACTER;
    const known = this.bySlot.get(info.slot);
    if (known?.info.id === info.id) {
      known.info = info;
      known.player.characterId = characterId;
      if (known.follower && known.follower.petId !== info.followerPetId) this.removeFollower(known);
      return false;
    }
    this.remove(info.slot);
    const player = new Player(info.id, characterId);
    player.simulatedHere = false;
    const view = this.feathers ? new PlayerView(player, this.feathers, false) : null;
    this.bySlot.set(info.slot, { info, player, view, track: new PoseTrack(), follower: null });
    return true;
  }

  remove(slot: number): void {
    const remote = this.bySlot.get(slot);
    if (!remote) return;
    this.bySlot.delete(slot);
    this.removeFollower(remote);
    this.hide(remote);
  }

  private hide(shown: Shown): void {
    this.world.part(shown.player.id);
    if (!shown.view) return;
    this.object.remove(shown.view.object);
    shown.view.dispose();
  }

  private removeFollower(remote: Remote): void {
    if (remote.follower) this.hide(remote.follower);
    remote.follower = null;
  }

  clear(): void {
    for (const slot of [...this.bySlot.keys()]) this.remove(slot);
  }

  /** The pose of the player in `slot`, at byte `at` of a frame heard at `time` seconds. */
  hear(slot: number, view: DataView, at: number, time: number): void {
    const remote = this.bySlot.get(slot);
    if (!remote) return;
    // Nobody is shown, or counted as being in the world, before their first pose.
    if (!remote.track.started) {
      this.world.join(remote.player);
      if (remote.view) this.object.add(remote.view.object);
    }
    remote.track.push(view, at, time);
  }

  /** The pose of the pet following the player in `slot`. */
  hearFollower(slot: number, view: DataView, at: number, time: number): void {
    const remote = this.bySlot.get(slot);
    const petId = remote?.info.followerPetId;
    if (!remote || !petId) return;
    if (!remote.follower) {
      // What the pet looks like comes from the server; until it has said, there is nothing to show.
      const pet = this.petOf(remote.info.id, petId);
      if (!pet) return;
      const def = petCharacter(pet.id, pet.dna);
      const player = new Player(`pet-${petId}`, def.id);
      player.human = false;
      player.simulatedHere = false;
      const shown = this.feathers ? new PlayerView(player, this.feathers, false, def) : null;
      remote.follower = { petId, player, view: shown, track: new PoseTrack() };
      this.world.join(player);
      if (shown) this.object.add(shown.object);
    }
    remote.follower.track.push(view, at, time);
  }

  /** Once per drawn frame, between the feathers' `begin` and `end`. `time` is in seconds. */
  frame(dt: number, time: number): void {
    for (const remote of this.bySlot.values()) {
      const follower = remote.follower;
      if (follower && time - follower.track.heardAt > FOLLOWER_GONE_AFTER) this.removeFollower(remote);
      else if (follower) {
        follower.track.apply(follower.player, time);
        follower.view?.update(dt);
      }
      if (!remote.track.started) continue;
      remote.track.apply(remote.player, time);
      remote.view?.update(dt);
    }
  }
}
