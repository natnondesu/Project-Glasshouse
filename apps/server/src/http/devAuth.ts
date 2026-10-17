import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Actor } from '../store/commandStore';

export type Authenticate = (request: FastifyRequest) => Actor | null | Promise<Actor | null>;

const NAME_MAX = 60;

/** GLASSHOUSE_AUTH=dev-insecure: an unverified admin named by a header (or "Developer"). Local development only. */
export const devAuthenticate: Authenticate = (request) => {
  const header = request.headers['x-glasshouse-dev-user'];
  const name = typeof header === 'string' && header.trim() !== '' ? header.trim().slice(0, NAME_MAX) : 'Developer';
  return { id: `dev:${name}`, name, role: 'admin', verified: false };
};

export function registerDevAuthRoutes(app: FastifyInstance): void {
  app.get('/auth/config', async () => ({ mode: 'dev' }));
}
