import { d1Store } from './d1Store';
import {
  createPlayer,
  givePet,
  login,
  overview,
  playerForToken,
  playerView,
  Refusal,
  removePet,
  resetCode,
} from './rules';
import type { Deps } from './rules';
import type { Store } from './store';

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

  if (path === '/players' && method === 'GET') return json({ players: await overview(store) });
  if (path === '/players' && method === 'POST') {
    const { nickname } = await fields(request);
    const { player, code } = await createPlayer(store, deps, nickname);
    return json({ player: await playerView(store, player), code });
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
  return refuse('not-found', 404);
}

async function route(request: Request, env: Env): Promise<Response> {
  const path = new URL(request.url).pathname.replace(/\/+$/, '');
  const method = request.method;
  const store = d1Store(env.DB);
  const address = request.headers.get('CF-Connecting-IP') ?? 'unknown';

  if (path === '/api/login' && method === 'POST') {
    // Every try counts, right or wrong, so that codes cannot be guessed.
    if (!(await env.LOGIN_LIMITER.limit({ key: address })).success) return refuse('slow-down', 429);
    const { code } = await fields(request);
    const { token, player } = await login(store, deps, code);
    return json({ token, player: await playerView(store, player) });
  }

  if (path === '/api/me' && method === 'GET') {
    const player = await playerForToken(store, bearer(request));
    if (!player) return refuse('signed-out', 401);
    return json({ player: await playerView(store, player) });
  }

  if (path.startsWith('/api/admin/')) {
    if (!(await env.ADMIN_LIMITER.limit({ key: address })).success) return refuse('slow-down', 429);
    if (!(await isAdmin(request, env))) return refuse('not-admin', 401);
    return admin(request, path.slice('/api/admin'.length), store);
  }

  return refuse('not-found', 404);
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
