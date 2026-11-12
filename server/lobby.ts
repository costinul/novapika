import { DurableObject } from 'cloudflare:workers';
import { HELPER_LOBBIES, SOUND_HEAD } from '../shared/helper';
import { FRAME_SPEECH, PROTOCOL } from '../shared/net';
import type { SharedWorld } from '../shared/net';
import { d1Store } from './d1Store';
import { HelperMind } from './helper';
import type { Usage } from './helper';
import { helperAi } from './helperAi';
import { LobbyRules } from './lobbyRules';
import type { Member } from './lobbyRules';
import { aboutPlayer, helperOn, keepTalk } from './rules';

// One lobby on Cloudflare: a Durable Object that every player in the lobby
// holds a WebSocket to. The rules are in lobbyRules.ts; this only connects
// them to the sockets. The Worker has already checked who is connecting.
// A lobby with a helper parrot also runs its mind, whose rules are in helper.ts.

/** Headers the Worker adds once it knows who the player is. Never trusted from outside. */
export const PLAYER_HEADER = 'X-Novapika-Player';
export const NICKNAME_HEADER = 'X-Novapika-Nickname';
/** Which lobby this is. */
export const LOBBY_HEADER = 'X-Novapika-Lobby';
/** Where the lobby keeps how its toys stand, in its own storage. */
const WORLD_KEY = 'world';
/** Where the lobby keeps its own name, and how many phrases the helper parrot has answered today. */
const NAME_KEY = 'name';
const USAGE_KEY = 'helper-usage';
/** How long the owner's switch for the helper parrot is trusted before it is read again. */
const SWITCH_FOR = 30_000; // ms

const fault = (message: string, error: unknown): void =>
  console.error(JSON.stringify({ message, error: error instanceof Error ? error.message : String(error) }));

export class Lobby extends DurableObject<Env> {
  private readonly rules = new LobbyRules<WebSocket>({
    send: (ws, data) => {
      try {
        ws.send(data);
      } catch {
        // Already closed: its close event tidies up.
      }
    },
    close: (ws, code, reason) => {
      try {
        ws.close(code, reason);
      } catch {
        // Already closed.
      }
    },
    keep: (ws, member) => ws.serializeAttachment(member),
    save: (world) => {
      try {
        if (world) this.ctx.storage.kv.put(WORLD_KEY, world);
        else this.ctx.storage.kv.delete(WORLD_KEY);
      } catch (error) {
        // The lobby carries on from memory; only a sleep would lose how the toys stand.
        fault('world not saved', error);
      }
    },
    heard: (ws, member, samples) => {
      const mind = this.helper();
      if (!mind) return;
      const speaker = { id: member.id, nickname: member.nickname };
      const players = this.rules.players.map((player) => player.nickname);
      // A copy: the samples must outlast the message they came in.
      this.ctx.waitUntil(
        mind.heard(speaker, samples.slice(), players).then((result) => {
          // An answer, or a squawk, reaches everybody. Otherwise nothing is
          // coming for this phrase: tell their game, so that it stops waiting.
          if (result === 'answered' || result === 'failed') return;
          this.rules.tell(ws, { t: 'helper', listens: result !== 'off' && result !== 'spent' });
        }),
      );
    },
  });

  private name: string;
  /** The helper parrot's mind, once it has been asked for. Null if this lobby has none. */
  private mind: HelperMind | null | undefined;
  private helperSwitch = { on: false, readAt: -Infinity };

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Back from sleep: the sockets are still open, and each remembers its player.
    for (const ws of ctx.getWebSockets()) {
      const member = ws.deserializeAttachment() as Member | null;
      if (member) this.rules.restore(ws, member);
    }
    const world = ctx.storage.kv.get<SharedWorld>(WORLD_KEY);
    if (world) this.rules.restoreWorld(world);
    this.name = ctx.storage.kv.get<string>(NAME_KEY) ?? '';
  }

  async fetch(request: Request): Promise<Response> {
    const id = request.headers.get(PLAYER_HEADER);
    if (!id) return new Response(null, { status: 400 });
    const nickname = decodeURIComponent(request.headers.get(NICKNAME_HEADER) ?? '');
    const name = request.headers.get(LOBBY_HEADER) ?? '';
    if (name !== this.name) {
      this.name = name;
      this.ctx.storage.kv.put(NAME_KEY, name);
    }

    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    this.rules.join(server, { id, nickname }, Date.now());
    // Whether the helper parrot will listen to them, once that is known.
    const mind = this.helper();
    if (mind) {
      this.ctx.waitUntil(
        mind.listens(id).then(
          (listens) => this.rules.tell(server, { t: 'helper', listens }),
          (error: unknown) => fault('helper switch not read', error),
        ),
      );
    }
    // A browser that offered protocols drops the connection unless one is chosen.
    return new Response(null, { status: 101, webSocket: client, headers: { 'Sec-WebSocket-Protocol': PROTOCOL } });
  }

  webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): void {
    if (typeof message === 'string') this.rules.text(ws, message);
    else this.rules.binary(ws, message);
  }

  webSocketClose(ws: WebSocket): void {
    this.left(ws);
  }

  webSocketError(ws: WebSocket): void {
    this.left(ws);
  }

  private left(ws: WebSocket): void {
    this.rules.leave(ws);
    // An empty lobby forgets what was said in it.
    if (this.rules.players.length === 0) this.mind?.forget();
  }

  /**
   * The helper parrot's mind, made the first time it is wanted. Null if this
   * lobby has no helper, or the server has not been given the keys it needs.
   */
  private helper(): HelperMind | null {
    if (this.mind !== undefined) return this.mind;
    const ai = HELPER_LOBBIES.includes(this.name) ? helperAi(this.env) : null;
    if (!ai) return (this.mind = null);
    const store = d1Store(this.env.DB);
    const now = (): number => Date.now();
    this.mind = new HelperMind(
      {
        ...ai,
        lobbyId: this.name,
        now,
        on: async () => {
          // Read at most every half minute: every phrase asks.
          if (now() - this.helperSwitch.readAt > SWITCH_FOR) this.helperSwitch = { on: await helperOn(store), readAt: now() };
          return this.helperSwitch.on;
        },
        about: (playerId) => aboutPlayer(store, playerId),
        record: (talk) => keepTalk(store, { id: () => crypto.randomUUID() }, talk),
        keep: (usage) => this.ctx.storage.kv.put(USAGE_KEY, usage),
        say: (audio) => {
          const frame = new Uint8Array(SOUND_HEAD + audio.byteLength);
          frame[0] = FRAME_SPEECH;
          frame.set(new Uint8Array(audio), SOUND_HEAD);
          this.rules.sendAll(frame.buffer);
        },
        squawk: () => this.rules.tellAll({ t: 'squawk' }),
        failed: (step, error) => fault(`helper: ${step} failed`, error),
      },
      this.ctx.storage.kv.get<Usage>(USAGE_KEY) ?? null,
    );
    return this.mind;
  }
}
