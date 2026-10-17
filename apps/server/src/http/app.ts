import fastifyCookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';
import type { Actor } from '../store/commandStore';
import type { WorkspaceService } from '../workspaceService';
import { checkMutation } from './auth/csrf';
import { registerCommands } from './commands';
import type { Authenticate } from './devAuth';
import { registerEvents } from './events';

declare module 'fastify' {
  interface FastifyRequest {
    actor: Actor | null;
  }
}

/** Project files can be several MB; the default 1 MB would refuse real imports. */
const BODY_LIMIT = 25 * 1024 * 1024;

export interface AppDeps {
  service: WorkspaceService;
  authenticate: Authenticate;
  /** Public sign-in routes (/auth/*): dev or real. */
  authRoutes: (app: FastifyInstance) => void | Promise<void>;
  /** GLASSHOUSE_PUBLIC_URL's origin; null in dev-insecure. */
  publicOrigin: string | null;
  /** Admin-only API routes, registered inside the authenticated plugin. */
  admin?: (api: FastifyInstance) => void;
  /** Fastify's trustProxy, so request.ip is the client behind a reverse proxy. */
  trustProxy?: boolean | number | string;
  webDir?: string | null;
  logger?: boolean;
  heartbeatMs?: number;
}

// Fastify's types take a function (not a hop count) for "trust the nearest N proxies".
const hopsTrusted = (hops: number) => (_address: string, hop: number): boolean => hop < hops;

export async function buildApp({ service, authenticate, authRoutes, publicOrigin, admin, trustProxy = false, webDir = null, logger = false, heartbeatMs }: AppDeps): Promise<FastifyInstance> {
  // Force-close: open event streams would otherwise keep shutdown waiting forever.
  const app = Fastify({ logger, trustProxy: typeof trustProxy === 'number' ? hopsTrusted(trustProxy) : trustProxy, bodyLimit: BODY_LIMIT, forceCloseConnections: true });
  await app.register(fastifyCookie);
  app.decorateRequest('actor', null);
  app.get('/api/health', async () => ({ ok: true, seq: service.state.seq }));
  await app.register(async (auth) => {
    await authRoutes(auth);
  });
  // Auth is attached to the routes in this plugin, not to a URL prefix: the router decodes paths
  // (/%61pi/...), so a prefix test on the raw URL could be bypassed.
  await app.register(async (api) => {
    api.addHook('onRequest', async (request, reply) => {
      const actor = await authenticate(request);
      if (!actor) return reply.code(401).send({ error: { code: 'unauthorised', message: 'Sign in to use Glasshouse.', targets: [] } });
      if (actor.mustChangePassword) return reply.code(403).send({ error: { code: 'password_change_required', message: 'Change your temporary password first.', targets: [] } });
      const csrf = checkMutation(request, publicOrigin);
      if (csrf) return reply.code(403).send({ error: { code: 'csrf', message: csrf, targets: [] } });
      request.actor = actor;
    });
    api.get('/api/workspace', async () => service.state);
    registerCommands(api, service);
    registerEvents(api, service, { heartbeatMs });
    admin?.(api);
  });
  if (webDir) {
    await app.register(fastifyStatic, { root: webDir, wildcard: false });
    // The web app routes on the client: any other GET outside /api gets index.html.
    app.setNotFoundHandler((request, reply) => {
      if (request.method === 'GET' && !request.url.startsWith('/api/')) return reply.sendFile('index.html');
      return reply.code(404).send({ error: { code: 'not_found', message: 'Not found.', targets: [] } });
    });
  }
  return app;
}
