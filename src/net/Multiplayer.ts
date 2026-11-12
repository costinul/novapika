import { Group, Vector3 } from 'three';
import { FRAME_POSES } from '../../shared/net';
import type { AboutMe, LobbyPlayer, RtcData, ServerMessage } from '../../shared/net';
import type { FeatherBatch } from '../characters/FeatherBatch';
import type { Player } from '../player/Player';
import type { Voice } from '../voice/Voice';
import type { WorldState } from '../world/WorldState';
import type { Connect, Link } from './LobbyClient';
import { POSE_BYTES, POSE_PLAYER, writePose } from './pose';
import { RemotePlayers } from './RemotePlayers';

/** How often this game tells the others where its parrots are. */
const SEND_HZ = 15;
/** The most poses one game ever sends at once: its player, their follower and the lobby's parrots. */
const MOST_POSES = 40;

export interface MultiplayerDeps {
  world: WorldState;
  /** Left out when there is nothing to draw with, as in tests. */
  feathers: FeatherBatch | null;
  /** The player this game is played by. */
  local: Player;
  /** Opens the line to the lobby. */
  connect: Connect;
  /** What the others should know about the local player. */
  about(): AboutMe;
  /** The server would not have us: the sign-in may no longer be good. */
  onRefused(): void;
  /** The lobby has let this player in, and said which place is theirs. */
  onJoined?(): void;
  /** Talking to the other players. Left out, nobody is heard. */
  voice?: Pick<Voice, 'call' | 'signal' | 'remove' | 'clear' | 'place'>;
  /** The time in seconds. Left out, the browser's clock. */
  now?(): number;
}

/**
 * Playing with others. Each game simulates its own player and only shows the
 * rest: it sends its player's pose many times a second, and moves everyone
 * else to the poses it hears.
 */
export class Multiplayer {
  /** Add this to the scene: the other players' models. */
  readonly object = new Group();
  readonly remotes: RemotePlayers;
  private link: Link | null = null;
  /** This player's place in the lobby, or -1 before the lobby has said. */
  slot = -1;
  private sendIn = 0;
  private readonly frameBytes = new ArrayBuffer(2 + POSE_BYTES * MOST_POSES);
  private readonly frameView = new DataView(this.frameBytes);
  private readonly now: () => number;
  private readonly scratch = new Vector3();

  constructor(private readonly deps: MultiplayerDeps) {
    this.now = deps.now ?? (() => performance.now() / 1000);
    this.remotes = new RemotePlayers(deps.world, deps.feathers);
    this.object.add(this.remotes.object);
  }

  /** True once the lobby has let this player in. */
  get online(): boolean {
    return this.slot >= 0;
  }

  /** Join a lobby, leaving any other first. */
  join(lobbyId: string): void {
    this.leave();
    this.link = this.deps.connect(lobbyId, {
      onOpen: () => this.aboutChanged(),
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

  /** The local player has changed parrot or follower: tell the others. */
  aboutChanged(): void {
    this.link?.send({ t: 'me', me: this.deps.about() });
  }

  /** Once per drawn frame, between the feathers' `begin` and `end`. */
  frame(dt: number): void {
    this.remotes.frame(dt, this.now());
    const head = this.deps.local.head;
    this.deps.voice?.place(head.position, head.quaternion, (slot) => this.remotes.headOf(slot), this.scratch);

    if (!this.online || !this.link?.open) return;
    this.sendIn -= dt;
    if (this.sendIn > 0) return;
    this.sendIn = Math.max(0, this.sendIn + 1 / SEND_HZ);
    const view = this.frameView;
    view.setUint8(0, FRAME_POSES);
    writePose(view, 2, POSE_PLAYER, this.deps.local);
    this.link.sendFrame(new Uint8Array(this.frameBytes, 0, 2 + POSE_BYTES));
  }

  private offline(): void {
    this.slot = -1;
    this.remotes.clear();
    this.deps.voice?.clear();
  }

  /** Somebody else is in the lobby, or has changed parrot. */
  private meet(player: LobbyPlayer): void {
    if (player.slot === this.slot) return;
    // Of any two players, the one in the lower place rings the other.
    if (this.remotes.set(player) && this.slot < player.slot) this.deps.voice?.call(player.slot);
  }

  private onMessage(message: ServerMessage): void {
    switch (message.t) {
      case 'welcome':
        this.offline();
        this.slot = message.you;
        for (const player of message.players) this.meet(player);
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
        break;
      case 'rtc':
        this.deps.voice?.signal(message.from, message.data);
        break;
    }
  }

  private onFrame(data: ArrayBuffer): void {
    const view = new DataView(data);
    if (view.byteLength < 2 || view.getUint8(0) !== FRAME_POSES) return;
    const from = view.getUint8(1);
    const time = this.now();
    for (let at = 2; at + POSE_BYTES <= view.byteLength; at += POSE_BYTES) {
      if (view.getUint8(at) === POSE_PLAYER) this.remotes.hear(from, view, at, time);
    }
  }
}
