import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';
import type { Actor } from '../store/commandStore';
import type { WorkspaceService } from '../workspaceService';
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
  webDir?: string | null;
  logger?: boolean;
  heartbeatMs?: number;
}

export async function buildApp({ service, authenticate, webDir = null, logger = false, heartbeatMs }: AppDeps): Promise<FastifyInstance> {
  // Force-close: open event streams would otherwise keep shutdown waiting forever.
  const app = Fastify({ logger, bodyLimit: BODY_LIMIT, forceCloseConnections: true });
  app.decorateRequest('actor', null);
  app.get('/api/health', async () => ({ ok: true, seq: service.state.seq }));
  // Auth is attached to the routes in this plugin, not to a URL prefix: the router decodes paths
  // (/%61pi/...), so a prefix test on the raw URL could be bypassed.
  await app.register(async (api) => {
    api.addHook('onRequest', async (request, reply) => {
      const actor = authenticate(request);
      if (!actor) return reply.code(401).send({ error: { code: 'unauthorised', message: 'Sign in to use Glasshouse.', targets: [] } });
      request.actor = actor;
    });
    api.get('/api/workspace', async () => service.state);
    registerCommands(api, service);
    registerEvents(api, service, { heartbeatMs });
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
