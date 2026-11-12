import { Group } from 'three';
import type { LobbyPlayer } from '../../shared/net';
import type { FeatherBatch } from '../characters/FeatherBatch';
import { DEFAULT_CHARACTER, roster } from '../characters/roster';
import { Player } from '../player/Player';
import { PlayerView } from '../player/PlayerView';
import type { WorldState } from '../world/WorldState';
import { PoseTrack } from './pose';

interface Remote {
  info: LobbyPlayer;
  player: Player;
  view: PlayerView | null;
  track: PoseTrack;
}

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
  ) {}

  /** The other players who have been seen to move, by slot. */
  get players(): ReadonlyMap<number, Player> {
    const seen = new Map<number, Player>();
    for (const [slot, remote] of this.bySlot) if (remote.track.started) seen.set(slot, remote.player);
    return seen;
  }

  /** Somebody is in the lobby, or has changed parrot. */
  set(info: LobbyPlayer): void {
    const characterId = info.characterId in roster ? info.characterId : DEFAULT_CHARACTER;
    const known = this.bySlot.get(info.slot);
    if (known?.info.id === info.id) {
      known.info = info;
      known.player.characterId = characterId;
      return;
    }
    this.remove(info.slot);
    const player = new Player(info.id, characterId);
    player.simulatedHere = false;
    const view = this.feathers ? new PlayerView(player, this.feathers, false) : null;
    this.bySlot.set(info.slot, { info, player, view, track: new PoseTrack() });
  }

  remove(slot: number): void {
    const remote = this.bySlot.get(slot);
    if (!remote) return;
    this.bySlot.delete(slot);
    this.world.players.delete(remote.player.id);
    if (remote.view) {
      this.object.remove(remote.view.object);
      remote.view.dispose();
    }
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
      this.world.players.set(remote.player.id, remote.player);
      if (remote.view) this.object.add(remote.view.object);
    }
    remote.track.push(view, at, time);
  }

  /** Once per drawn frame, between the feathers' `begin` and `end`. `time` is in seconds. */
  frame(dt: number, time: number): void {
    for (const remote of this.bySlot.values()) {
      if (!remote.track.started) continue;
      remote.track.apply(remote.player, time);
      remote.view?.update(dt);
    }
  }
}
