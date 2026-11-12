import { DurableObject } from 'cloudflare:workers';
import { HELPER_LOBBIES, SOUND_HEAD } from '../shared/helper';
import { FRAME_SPEECH, PROTOCOL } from '../shared/net';
import type { SharedWorld } from '../shared/net';
import { d1Store } from './d1Store';
import { deps } from './deps';
import { HelperMind } from './helper';
import type { Usage } from './helper';
import { helperAi } from './helperAi';
import { LobbyRules } from './lobbyRules';
import type { Gift, Member } from './lobbyRules';
import { aboutPlayer, helperOn, keepTalk, openPresent, Refusal } from './rules';

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
/** Where the lobby keeps the present that is waiting in it, if there is one. */
const GIFT_KEY = 'gift';
/** How long the owner's switch for the helper parrot is trusted before it is read again. */
const SWITCH_FOR = 30_000; // ms

const fault = (message: string, error: unknown): void =>
  console.error(JSON.stringify({ message, error: error instanceof Error ? error.message : String(error) }));

/** Log what became of a phrase or a greeting: how it ended and how long it took. Never a word of what was said. */
const turned = (kind: 'phrase' | 'greeting', result: string, started: number, bytes?: number): void =>
  console.log(JSON.stringify({ message: `helper ${kind}`, result, ms: Date.now() - started, bytes }));

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
      const started = Date.now();
      // A copy: the samples must outlast the message they came in.
      this.ctx.waitUntil(
        mind.heard(speaker, samples.slice(), players).then((result) => {
          turned('phrase', result, started, samples.length);
          // An answer, or a squawk, reaches everybody. Otherwise nothing is
          // coming for this phrase: tell their game, so that it stops waiting.
          if (result === 'answered' || result === 'failed') return;
          // Nothing could be made out: the helper gives its own call, to them alone.
          if (result === 'nothing') return this.rules.tell(ws, { t: 'squawk' });
          this.rules.tell(ws, { t: 'helper', listens: result !== 'off' && result !== 'spent' });
        }),
      );
    },
    near: (_ws, member) => {
      const mind = this.helper();
      if (!mind) return;
      const players = this.rules.players.map((player) => player.nickname);
      const started = Date.now();
      this.ctx.waitUntil(
        mind.near({ id: member.id, nickname: member.nickname }, players).then((result) => {
          // A game says so every little while for as long as its player stays: only what came of it is worth a line.
          if (result !== 'nothing') turned('greeting', result, started);
        }),
      );
    },
    give: async (member, gift) => {
      try {
        await openPresent(d1Store(this.env.DB), deps, member.id, gift.founderId);
        return true;
      } catch (error) {
        // A player with no room for it is no fault; anything else is.
        if (!(error instanceof Refusal)) fault('present not given', error);
        return false;
      }
    },
    keepGift: (gift) => {
      try {
        if (gift) this.ctx.storage.kv.put(GIFT_KEY, gift);
        else this.ctx.storage.kv.delete(GIFT_KEY);
      } catch (error) {
        // The lobby carries on from memory; only a sleep would lose the present.
        fault('present not kept', error);
      }
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
    const gift = ctx.storage.kv.get<Gift>(GIFT_KEY);
    if (gift) this.rules.restoreGift(gift);
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
    // What the helper parrot is doing, and whether it will listen to them, once that is known.
    const mind = this.helper();
    if (mind) {
      this.rules.tell(server, { t: 'intent', intent: mind.doing });
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

  /** How many players are in the lobby now. The Worker asks, for the boards by the gates. */
  count(): number {
    return this.rules.players.length;
  }

  /** How many players are in, and whether a present is there. The Worker asks, for the owner's page. */
  room(): { players: number; present: boolean } {
    return { players: this.rules.players.length, present: this.rules.hasGift };
  }

  /**
   * The owner lets a present go from the sky over the lobby, with this fixed
   * pet inside. False if one is already there.
   */
  letGo(founderId: string): boolean {
    return this.rules.drop({ id: crypto.randomUUID(), founderId, droppedAt: Date.now() });
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
    const member = this.rules.memberOf(ws);
    this.rules.leave(ws);
    if (member) this.mind?.left(member.id);
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
        act: (intent) => this.rules.tellAll({ t: 'intent', intent }),
        squawk: () => this.rules.tellAll({ t: 'squawk' }),
        failed: (step, error) => fault(`helper: ${step} failed`, error),
      },
      this.ctx.storage.kv.get<Usage>(USAGE_KEY) ?? null,
    );
    return this.mind;
  }
}
