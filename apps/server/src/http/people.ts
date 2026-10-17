import type { FastifyInstance } from 'fastify';
import type { IdentityStore } from '../identity/types';

/** Names and emails for showing verified people (approvals, notes). Everyone signed in may read it: one team, global access. */
export function registerPeople(api: FastifyInstance, store: IdentityStore): void {
  api.get('/api/people', async () => ({ people: (await store.listUsers()).map((u) => ({ id: u.id, name: u.displayName, email: u.email })) }));
}
