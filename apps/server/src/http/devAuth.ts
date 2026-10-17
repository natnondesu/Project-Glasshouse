import type { FastifyRequest } from 'fastify';
import type { Actor } from '../store/commandStore';

export type Authenticate = (request: FastifyRequest) => Actor | null;

const NAME_MAX = 60;

/** GLASSHOUSE_AUTH=dev-insecure: trusts a header (or "Developer"). Never for a shared deployment — Plan B replaces it. */
export const devAuthenticate: Authenticate = (request) => {
  const header = request.headers['x-glasshouse-dev-user'];
  const name = typeof header === 'string' && header.trim() !== '' ? header.trim().slice(0, NAME_MAX) : 'Developer';
  return { id: `dev:${name}`, name };
};
