// Point d'entrée du Worker "ggames-api" : routage HTTP de /api/* vers le Durable Object World.
// Les autres chemins sont servis depuis dist/ (développement local) ; en production, les fichiers
// statiques sont servis par Cloudflare Pages, qui relaie /api/* vers ce Worker.

import { bearerToken, errorResponse, readJsonBody, toResponse } from './http.ts';
import { World } from './platform/world.ts';

export { World };

type Handler = (ctx: {
  world: DurableObjectStub<World>;
  token: string | null;
  params: string[];
  body: () => Promise<Record<string, unknown> | null>;
  request: Request;
}) => Promise<Response>;

interface Route {
  method: string;
  pattern: RegExp;
  handler: Handler;
}

const ID = '([a-z0-9]{6,20})';
const GAME = '([a-z][a-z0-9-]{1,30})';

/** Exige un corps JSON objet, sinon 400. */
const withBody =
  (handler: (body: Record<string, unknown>, ...rest: Parameters<Handler>) => Promise<Response>): Handler =>
  async (ctx) => {
    const body = await ctx.body();
    return body ? handler(body, ctx) : errorResponse(400, 'invalid body');
  };

const ROUTE_TABLE: readonly Route[] = [
  {
    method: 'POST',
    pattern: /^\/api\/auth\/register$/,
    handler: withBody(async (b, { world }) => toResponse(await world.register(b['name'], b['password']))),
  },
  {
    method: 'POST',
    pattern: /^\/api\/auth\/login$/,
    handler: withBody(async (b, { world }) => toResponse(await world.login(b['name'], b['password']))),
  },
  {
    method: 'POST',
    pattern: /^\/api\/auth\/logout$/,
    handler: async ({ world, token }) => toResponse(await world.logout(token)),
  },
  { method: 'GET', pattern: /^\/api\/me$/, handler: async ({ world, token }) => toResponse(await world.me(token)) },
  {
    method: 'PATCH',
    pattern: /^\/api\/me$/,
    handler: withBody(async (b, { world, token }) => toResponse(await world.rename(token, b['name']))),
  },
  {
    method: 'GET',
    pattern: /^\/api\/games$/,
    handler: async ({ world, token }) => toResponse(await world.listGames(token)),
  },
  {
    method: 'GET',
    pattern: new RegExp(`^/api/games/${GAME}$`),
    handler: async ({ world, token, params }) => toResponse(await world.getGame(token, params[0])),
  },
  {
    method: 'GET',
    pattern: new RegExp(`^/api/games/${GAME}/players/${ID}$`),
    handler: async ({ world, token, params }) => toResponse(await world.getPlayerDetail(token, params[0], params[1])),
  },
  {
    method: 'POST',
    pattern: new RegExp(`^/api/games/${GAME}/runs$`),
    handler: withBody(async (b, { world, token, params }) =>
      toResponse(await world.submitRun(token, params[0], b['key'], b['status'], b['durationMs'], b['replay'])),
    ),
  },
  {
    method: 'GET',
    pattern: new RegExp(`^/api/runs/${ID}$`),
    handler: async ({ world, token, params }) => toResponse(await world.getRun(token, params[0])),
  },
  { method: 'GET', pattern: /^\/api\/live$/, handler: async ({ world, request }) => world.fetch(request) },
];

/** Le type de classe du Durable Object n'est pas déduit par `wrangler types` : on le précise ici. */
const worldOf = (env: Env): DurableObjectStub<World> => (env.WORLD as DurableObjectNamespace<World>).getByName('main');

async function route(request: Request, env: Env): Promise<Response> {
  const { pathname } = new URL(request.url);
  for (const { method, pattern, handler } of ROUTE_TABLE) {
    const match = pattern.exec(pathname);
    if (!match) continue;
    if (request.method !== method) continue;
    return handler({
      world: worldOf(env),
      token: bearerToken(request),
      params: match.slice(1),
      body: () => readJsonBody(request),
      request,
    });
  }
  return errorResponse(404, 'not found');
}

export default {
  async fetch(request, env): Promise<Response> {
    if (!new URL(request.url).pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    try {
      return await route(request, env);
    } catch (error: unknown) {
      console.error('unhandled api error', error);
      return errorResponse(500, 'internal error');
    }
  },
} satisfies ExportedHandler<Env>;
