import { LOBBY_IDS, PROTOCOL } from '../shared/net';
import { d1Store } from './d1Store';
import { NICKNAME_HEADER, PLAYER_HEADER } from './lobby';
import {
  answer,
  askFor,
  breedOwn,
  cancelRequest,
  chooseFollower,
  createPlayer,
  feedEgg,
  freePet,
  friendsOf,
  givePet,
  login,
  overview,
  playerForToken,
  playerView,
  Refusal,
  removePet,
  removePlayer,
  resetCode,
  restorePet,
} from './rules';
import type { Deps } from './rules';
import type { PlayerRow, Store } from './store';

export { Lobby } from './lobby';

// The game's API, at /api/*. It turns HTTP requests into calls to the rules
// in rules.ts and their answers into JSON. Everything else on the site is a
// static file, served without running this.

/** Bodies are a few short fields; anything bigger is not ours. */
const MAX_BODY_BYTES = 2048;

const deps: Deps = {
  now: () => Date.now(),
  random: () => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32,
  id: () => crypto.randomUUID(),
  token: () => Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, '0')).join(''),
};

const json = (body: unknown, status = 200): Response =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

const refuse = (error: string, status: number): Response => json({ error }, status);

/** The fields of a small JSON body, or none if there is no such body. */
async function fields(request: Request): Promise<Record<string, unknown>> {
  const length = Number(request.headers.get('Content-Length'));
  if (!(length > 0 && length <= MAX_BODY_BYTES)) return {};
  try {
    const value: unknown = await request.json();
    return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** The secret sent with the request: a player's token, or the admin password. */
function bearer(request: Request): string | null {
  const match = /^Bearer (.+)$/.exec(request.headers.get('Authorization') ?? '');
  return match ? match[1] : null;
}

/** Whether the request carries the admin password. Compared in constant time. */
async function isAdmin(request: Request, env: Env): Promise<boolean> {
  const given = bearer(request);
  if (!given || !env.ADMIN_PASSWORD) return false;
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(given)),
    crypto.subtle.digest('SHA-256', encoder.encode(env.ADMIN_PASSWORD)),
  ]);
  return crypto.subtle.timingSafeEqual(a, b);
}

async function admin(request: Request, path: string, store: Store): Promise<Response> {
  const method = request.method;
  let match: RegExpExecArray | null;

  if (path === '/players' && method === 'GET') return json({ players: await overview(store, deps) });
  if (path === '/players' && method === 'POST') {
    const { nickname } = await fields(request);
    const { player, code } = await createPlayer(store, deps, nickname);
    return json({ player: await playerView(store, player.id), code });
  }
  if ((match = /^\/players\/([\w-]+)$/.exec(path)) && method === 'DELETE') {
    await removePlayer(store, match[1]);
    return json({});
  }
  if ((match = /^\/players\/([\w-]+)\/code$/.exec(path)) && method === 'POST') {
    return json(await resetCode(store, deps, match[1]));
  }
  if ((match = /^\/players\/([\w-]+)\/pets$/.exec(path)) && method === 'POST') {
    const { founderId } = await fields(request);
    return json({ pet: await givePet(store, deps, match[1], founderId) });
  }
  if ((match = /^\/pets\/([\w-]+)$/.exec(path)) && method === 'DELETE') {
    await removePet(store, match[1]);
    return json({});
  }
  if ((match = /^\/pets\/([\w-]+)\/restore$/.exec(path)) && method === 'POST') {
    await restorePet(store, match[1]);
    return json({});
  }
  return refuse('not-found', 404);
}

/** What a signed-in player may do. Every change answers with the player as they now are. */
async function mine(request: Request, path: string, store: Store, player: PlayerRow): Promise<Response> {
  const method = request.method;
  const me = async (extra: object = {}): Promise<Response> =>
    json({ player: await playerView(store, player.id), ...extra });
  let match: RegExpExecArray | null;

  if (path === '/me' && method === 'GET') return me();
  if (path === '/friends' && method === 'GET') return json({ friends: await friendsOf(store, player) });

  if (method === 'POST') {
    const body = await fields(request);
    if (path === '/me/follower') {
      await chooseFollower(store, player, body.petId);
      return me();
    }
    if (path === '/breed') {
      await breedOwn(store, deps, player, body.petA, body.petB);
      return me();
    }
    if (path === '/requests') {
      await askFor(store, deps, player, body.myPetId, body.theirPetId);
      return me();
    }
    if ((match = /^\/requests\/([\w-]+)$/.exec(path))) {
      await answer(store, deps, player, match[1], body.accept);
      return me();
    }
    if (path === '/egg/feed') return me({ hatched: await feedEgg(store, player) });
    if ((match = /^\/pets\/([\w-]+)\/free$/.exec(path))) {
      await freePet(store, deps, player, match[1]);
      return me();
    }
  }
  if ((match = /^\/requests\/([\w-]+)$/.exec(path)) && method === 'DELETE') {
    await cancelRequest(store, player, match[1]);
    return me();
  }
  return refuse('not-found', 404);
}

/**
 * Open a player's WebSocket to a lobby. The token rides in the list of
 * protocols, as a browser cannot put a header on a WebSocket and it must
 * never be in the address.
 */
async function lobby(request: Request, env: Env, store: Store, lobbyId: string): Promise<Response> {
  if (request.headers.get('Upgrade') !== 'websocket') return refuse('not-a-socket', 426);
  if (!(LOBBY_IDS as readonly string[]).includes(lobbyId)) return refuse('not-found', 404);
  const [protocol, token] = (request.headers.get('Sec-WebSocket-Protocol') ?? '').split(',').map((part) => part.trim());
  const player = protocol === PROTOCOL ? await playerForToken(store, token ?? null) : null;
  if (!player) return refuse('signed-out', 401);

  // The lobby is told who this is by the Worker, never by the caller.
  const headers = new Headers(request.headers);
  headers.set(PLAYER_HEADER, player.id);
  headers.set(NICKNAME_HEADER, encodeURIComponent(player.nickname));
  return env.LOBBY.getByName(lobbyId).fetch(new Request(request, { headers }));
}

/** Where WebRTC can always ask for a player's own address. Free, and needs no key. */
const STUN = { urls: ['stun:stun.cloudflare.com:3478'] };
/** How long a player's pass for the voice relay lasts: longer than anyone plays in one go. */
const TURN_TTL = 24 * 60 * 60; // s

/**
 * The servers two players' games use to find a way to each other for voice.
 * With a Cloudflare TURN key set, a short-lived pass for its relay is
 * included, for players whose networks will not let them connect directly.
 * The key itself never leaves the server.
 */
async function iceServers(env: Env): Promise<unknown[]> {
  const { TURN_KEY_ID: id, TURN_KEY_API_TOKEN: token } = env as Env & { TURN_KEY_ID?: string; TURN_KEY_API_TOKEN?: string };
  if (!id || !token) return [STUN];
  try {
    const response = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${id}/credentials/generate-ice-servers`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ttl: TURN_TTL }),
    });
    if (!response.ok) throw new Error(`status ${response.status}`);
    return ((await response.json()) as { iceServers: unknown[] }).iceServers;
  } catch (error) {
    console.error(JSON.stringify({ message: 'no relay pass', error: error instanceof Error ? error.message : String(error) }));
    return [STUN];
  }
}

async function route(request: Request, env: Env): Promise<Response> {
  const path = new URL(request.url).pathname.replace(/\/+$/, '');
  if (!path.startsWith('/api/')) return refuse('not-found', 404);
  const rest = path.slice('/api'.length);
  const store = d1Store(env.DB);
  const address = request.headers.get('CF-Connecting-IP') ?? 'unknown';

  if (rest === '/login' && request.method === 'POST') {
    // Every try counts, right or wrong, so that codes cannot be guessed.
    if (!(await env.LOGIN_LIMITER.limit({ key: address })).success) return refuse('slow-down', 429);
    const { code } = await fields(request);
    const { token, player } = await login(store, deps, code);
    return json({ token, player: await playerView(store, player.id) });
  }

  if (rest.startsWith('/admin/')) {
    if (!(await env.ADMIN_LIMITER.limit({ key: address })).success) return refuse('slow-down', 429);
    if (!(await isAdmin(request, env))) return refuse('not-admin', 401);
    return admin(request, rest.slice('/admin'.length), store);
  }

  const room = /^\/lobby\/([\w-]+)$/.exec(rest);
  if (room && request.method === 'GET') return lobby(request, env, store, room[1]);

  const player = await playerForToken(store, bearer(request));
  if (!player) return refuse('signed-out', 401);
  if (rest === '/ice' && request.method === 'GET') return json({ iceServers: await iceServers(env) });
  return mine(request, rest, store, player);
}

export default {
  async fetch(request, env): Promise<Response> {
    try {
      return await route(request, env);
    } catch (error) {
      if (error instanceof Refusal) return refuse(error.reason, error.status);
      console.error(
        JSON.stringify({
          message: 'request failed',
          path: new URL(request.url).pathname,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
      return refuse('server', 500);
    }
  },
} satisfies ExportedHandler<Env>;
