import { Group, Vector3 } from 'three';
import type { PetView } from '../../shared/api';
import { SOUND_HEAD } from '../../shared/helper';
import { FRAME_HEAD, FRAME_HEARD, FRAME_POSES, FRAME_SPEECH } from '../../shared/net';
import type { AboutMe, LobbyPlayer, RtcData, ServerMessage, SharedWorld } from '../../shared/net';
import type { FeatherBatch } from '../characters/FeatherBatch';
import type { Helper } from '../helper/Helper';
import type { Player } from '../player/Player';
import type { Voice } from '../voice/Voice';
import type { Action, ActionLayer } from '../world/actions';
import type { WorldState } from '../world/WorldState';
import type { Connect, Link } from './LobbyClient';
import { POSE_BYTES, POSE_FLOCK, POSE_FOLLOWER, POSE_PLAYER, PoseTrack, writePose } from './pose';
import { RemotePlayers } from './RemotePlayers';

/** How often this game tells the others where its parrots and toys are. */
const SEND_HZ = 15;
/** The most poses one game ever sends at once: its player, their follower and the lobby's parrots. */
const MOST_POSES = 40;
/** Bytes one loose toy takes in a frame: which toy, where it is, and how it is turned. */
const TOY_BYTES = 21;
/** The most loose toys one game ever says the place of at once. */
const MOST_TOYS = 60;

export interface MultiplayerDeps {
  world: WorldState;
  /** The gate every change to the world's toys, bells and rings goes through. */
  actions: ActionLayer;
  /** Left out when there is nothing to draw with, as in tests. */
  feathers: FeatherBatch | null;
  /** The player this game is played by. */
  local: Player;
  /** Opens the line to the lobby. */
  connect: Connect;
  /** What the others should know about the local player. */
  about(): AboutMe;
  /** The lobby's own parrots, in the lobby's order. Left out, there are none. */
  flock?(): readonly Player[];
  /** The pet out following the local player, if there is one. */
  follower?(): Player | null;
  /** A pet of another player's, as the server last told it. Left out, no followers are shown. */
  petOf?(ownerId: string, petId: string): PetView | null;
  /** The server would not have us: the sign-in may no longer be good. */
  onRefused(): void;
  /** The lobby has let this player in, and said which place is theirs. */
  onJoined?(): void;
  /** Talking to the other players. Left out, nobody is heard. */
  voice?: Pick<Voice, 'call' | 'signal' | 'remove' | 'clear' | 'place'>;
  /** The lobby's helper parrot: what the lobby says of it, and its voice. Left out, it is never heard. */
  helper?: Pick<Helper, 'setListens' | 'speech' | 'squawk' | 'clear'>;
  /** The time in seconds. Left out, the browser's clock. */
  now?(): number;
}

/**
 * Playing with others. Each game simulates some parrots and only shows the
 * rest: its own player and their follower always, and the lobby's own
 * parrots if it is the host. It sends those parrots' poses many times a
 * second, and moves every other parrot to the poses it hears.
 *
 * Toys, bells and rings change only through actions. Each one this game
 * makes happen goes to the lobby, which passes it on; each one another game
 * made happen is taken as done. A loose toy is moved by one game, which says
 * where it is in the same frames as its parrots.
 */
export class Multiplayer {
  /** Add this to the scene: the other players' models. */
  readonly object = new Group();
  readonly remotes: RemotePlayers;
  private link: Link | null = null;
  /** This player's place in the lobby, or -1 before the lobby has said. */
  slot = -1;
  /** The place of the player whose game runs the lobby's own parrots. */
  private host = -1;
  /** What the lobby calls the local player. Inside this game they are `deps.local.id`. */
  private myId = '';
  private sentAbout = '';
  /** Where the host says each of the lobby's own parrots is. */
  private flockTracks: PoseTrack[] = [];
  private sendIn = 0;
  private readonly frameBytes = new ArrayBuffer(FRAME_HEAD + POSE_BYTES * MOST_POSES + TOY_BYTES * MOST_TOYS);
  private readonly frameView = new DataView(this.frameBytes);
  private readonly now: () => number;
  private readonly scratch = new Vector3();

  constructor(private readonly deps: MultiplayerDeps) {
    this.now = deps.now ?? (() => performance.now() / 1000);
    this.remotes = new RemotePlayers(deps.world, deps.feathers, deps.petOf ?? (() => null));
    this.object.add(this.remotes.object);
  }

  /** True once the lobby has let this player in. */
  get online(): boolean {
    return this.slot >= 0;
  }

  /** True when this game runs the lobby's own parrots: playing alone, or in longest. */
  get isHost(): boolean {
    return this.slot < 0 || this.host === this.slot;
  }

  /** Join a lobby, leaving any other first. */
  join(lobbyId: string): void {
    this.leave();
    this.link = this.deps.connect(lobbyId, {
      onOpen: () => this.tellAbout(true),
      onMessage: (message) => this.onMessage(message),
      onFrame: (data) => this.onFrame(data),
      onClose: () => this.offline(),
      onRefused: () => this.deps.onRefused(),
    });
  }

  leave(): void {
    const link = this.link;
    this.link = null;
    link?.close();
    this.offline();
  }

  /** Pass a voice set-up message to the player in place `to`. */
  sendRtc(to: number, data: RtcData): void {
    this.link?.send({ t: 'rtc', to, data });
  }

  /** Send the lobby a phrase the local player said to the helper parrot. It goes to nobody else. */
  sendHeard(samples: Int16Array): void {
    const frame = new Uint8Array(SOUND_HEAD + samples.byteLength);
    frame[0] = FRAME_HEARD;
    frame.set(new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength), SOUND_HEAD);
    this.link?.sendFrame(frame);
  }

  /** Tell the others what parrot the local player is and which pet follows them, if that is news. */
  private tellAbout(force = false): void {
    const me = this.deps.about();
    const text = JSON.stringify(me);
    if (!force && text === this.sentAbout) return;
    this.sentAbout = text;
    this.link?.send({ t: 'me', me });
  }

  /** Once per drawn frame, between the feathers' `begin` and `end`. */
  frame(dt: number): void {
    const now = this.now();
    this.remotes.frame(dt, now);
    if (!this.isHost) {
      const flock = this.deps.flock?.() ?? [];
      for (let i = 0; i < flock.length; i++) this.flockTracks[i]?.apply(flock[i], now);
    }
    const head = this.deps.local.head;
    this.deps.voice?.place(head.position, head.quaternion, (slot) => this.remotes.headOf(slot), this.scratch);

    if (!this.online || !this.link?.open) return;
    this.sendIn -= dt;
    if (this.sendIn > 0) return;
    this.sendIn = Math.max(0, this.sendIn + 1 / SEND_HZ);
    this.tellAbout();

    // Every parrot this game runs, then every loose toy it is moving, in one frame.
    const view = this.frameView;
    view.setUint8(0, FRAME_POSES);
    let at = FRAME_HEAD;
    let poses = 0;
    const add = (kind: number, player: Player): void => {
      if (poses >= MOST_POSES) return;
      writePose(view, at, kind, player);
      at += POSE_BYTES;
      poses++;
    };
    add(POSE_PLAYER, this.deps.local);
    const follower = this.deps.follower?.();
    if (follower) add(POSE_FOLLOWER, follower);
    if (this.isHost) this.deps.flock?.().forEach((player, i) => add(POSE_FLOCK + i, player));
    view.setUint8(2, poses);
    this.deps.world.forEachMoving((index, toy) => {
      if (index > 255 || at + TOY_BYTES > view.byteLength) return;
      view.setUint8(at, index);
      view.setFloat32(at + 1, toy.position.x, true);
      view.setFloat32(at + 5, toy.position.y, true);
      view.setFloat32(at + 9, toy.position.z, true);
      view.setInt16(at + 13, Math.round(toy.quaternion.x * 32767), true);
      view.setInt16(at + 15, Math.round(toy.quaternion.y * 32767), true);
      view.setInt16(at + 17, Math.round(toy.quaternion.z * 32767), true);
      view.setInt16(at + 19, Math.round(toy.quaternion.w * 32767), true);
      at += TOY_BYTES;
    });
    this.link.sendFrame(new Uint8Array(this.frameBytes, 0, at));
  }

  private offline(): void {
    this.slot = -1;
    this.host = -1;
    this.flockTracks = [];
    this.deps.actions.onLocal = null;
    this.remotes.clear();
    this.deps.world.unshare();
    this.deps.voice?.clear();
    this.deps.helper?.clear();
  }

  /** Somebody else is in the lobby, or has changed parrot. */
  private meet(player: LobbyPlayer): void {
    if (player.slot === this.slot) return;
    // Of any two players, the one in the lower place rings the other.
    if (this.remotes.set(player) && this.slot < player.slot) this.deps.voice?.call(player.slot);
  }

  private onMessage(message: ServerMessage): void {
    const { world, actions, local } = this.deps;
    switch (message.t) {
      case 'welcome':
        this.offline();
        this.slot = message.you;
        this.host = message.host;
        this.myId = message.players.find((player) => player.slot === message.you)?.id ?? '';
        for (const player of message.players) this.meet(player);
        // From here the lobby's toys, bells and rings are everybody's.
        world.share(local.id, this.inwardWorld(message.world));
        world.authority = this.isHost;
        actions.onLocal = (action) => this.link?.send({ t: 'act', action: this.outward(action) });
        this.deps.onJoined?.();
        break;
      case 'player':
        this.meet(message.player);
        break;
      case 'leave':
        this.remotes.remove(message.slot);
        this.deps.voice?.remove(message.slot);
        break;
      case 'host':
        this.host = message.slot;
        this.flockTracks = [];
        world.authority = this.isHost;
        break;
      case 'rtc':
        this.deps.voice?.signal(message.from, message.data);
        break;
      case 'act':
        actions.receive(this.inward(message.action));
        break;
      case 'held':
        world.setHolder(message.toyId, message.by === null ? null : this.inwardId(message.by), message.at);
        break;
      case 'helper':
        this.deps.helper?.setListens(message.listens);
        break;
      case 'squawk':
        this.deps.helper?.squawk();
        break;
    }
  }

  /** The local player is `local.id` in this game, and what the lobby calls them everywhere else. */
  private outward(action: Action): Action {
    return 'playerId' in action && action.playerId === this.deps.local.id ? { ...action, playerId: this.myId } : action;
  }

  private inwardId(id: string): string {
    return id === this.myId ? this.deps.local.id : id;
  }

  private inward(action: Action): Action {
    return 'playerId' in action ? { ...action, playerId: this.inwardId(action.playerId) } : action;
  }

  private inwardWorld(world: SharedWorld): SharedWorld {
    return { ...world, holders: world.holders.map(([toyId, playerId]) => [toyId, this.inwardId(playerId)]) };
  }

  private onFrame(data: ArrayBuffer): void {
    const view = new DataView(data);
    if (view.byteLength > SOUND_HEAD && view.getUint8(0) === FRAME_SPEECH) return this.deps.helper?.speech(data);
    if (view.byteLength < FRAME_HEAD || view.getUint8(0) !== FRAME_POSES) return;
    const from = view.getUint8(1);
    const time = this.now();
    const posesEnd = FRAME_HEAD + view.getUint8(2) * POSE_BYTES;
    if (posesEnd > view.byteLength) return;

    for (let at = FRAME_HEAD; at < posesEnd; at += POSE_BYTES) {
      const kind = view.getUint8(at);
      if (kind === POSE_PLAYER) this.remotes.hear(from, view, at, time);
      else if (kind === POSE_FOLLOWER) this.remotes.hearFollower(from, view, at, time);
      // Only the host says where the lobby's own parrots are.
      else if (from === this.host && !this.isHost) (this.flockTracks[kind - POSE_FLOCK] ??= new PoseTrack()).push(view, at, time);
    }
    for (let at = posesEnd; at + TOY_BYTES <= view.byteLength; at += TOY_BYTES) {
      this.deps.world.hearToy(
        view.getUint8(at),
        view.getFloat32(at + 1, true),
        view.getFloat32(at + 5, true),
        view.getFloat32(at + 9, true),
        view.getInt16(at + 13, true),
        view.getInt16(at + 15, true),
        view.getInt16(at + 17, true),
        view.getInt16(at + 19, true),
      );
    }
  }
}
