import { DurableObject } from 'cloudflare:workers';
import { PROTOCOL } from '../shared/net';
import type { SharedWorld } from '../shared/net';
import { LobbyRules } from './lobbyRules';
import type { Member } from './lobbyRules';

// One lobby on Cloudflare: a Durable Object that every player in the lobby
// holds a WebSocket to. The rules are in lobbyRules.ts; this only connects
// them to the sockets. The Worker has already checked who is connecting.

/** Headers the Worker adds once it knows who the player is. Never trusted from outside. */
export const PLAYER_HEADER = 'X-Novapika-Player';
export const NICKNAME_HEADER = 'X-Novapika-Nickname';
/** Where the lobby keeps how its toys stand, in its own storage. */
const WORLD_KEY = 'world';

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
        console.error(JSON.stringify({ message: 'world not saved', error: error instanceof Error ? error.message : String(error) }));
      }
    },
  });

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Back from sleep: the sockets are still open, and each remembers its player.
    for (const ws of ctx.getWebSockets()) {
      const member = ws.deserializeAttachment() as Member | null;
      if (member) this.rules.restore(ws, member);
    }
    const world = ctx.storage.kv.get<SharedWorld>(WORLD_KEY);
    if (world) this.rules.restoreWorld(world);
  }

  async fetch(request: Request): Promise<Response> {
    const id = request.headers.get(PLAYER_HEADER);
    if (!id) return new Response(null, { status: 400 });
    const nickname = decodeURIComponent(request.headers.get(NICKNAME_HEADER) ?? '');

    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    this.rules.join(server, { id, nickname }, Date.now());
    // A browser that offered protocols drops the connection unless one is chosen.
    return new Response(null, { status: 101, webSocket: client, headers: { 'Sec-WebSocket-Protocol': PROTOCOL } });
  }

  webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): void {
    if (typeof message === 'string') this.rules.text(ws, message);
    else this.rules.binary(ws, message);
  }

  webSocketClose(ws: WebSocket): void {
    this.rules.leave(ws);
  }

  webSocketError(ws: WebSocket): void {
    this.rules.leave(ws);
  }
}
