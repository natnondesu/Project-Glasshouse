import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryIdentityStore } from '../identity/memoryIdentityStore';
import type { Role, User } from '../identity/types';
import { MemoryCommandStore } from '../store/memoryStore';
import { WorkspaceService } from '../workspaceService';
import { buildApp } from './app';
import { registerDevAuthRoutes } from './devAuth';
import { registerPeople } from './people';

const apps: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((a) => a.close()));
});
const NOW = '2026-10-18T09:00:00.000Z';
const user = (id: string, role: Role, over: Partial<User> = {}): User => ({ id, email: `${id}@company.test`, displayName: `Name ${id}`, role, source: 'local', oidcSubject: null, passwordHash: 'x', mustChangePassword: false, nameLocked: false, active: true, createdAt: NOW, lastLoginAt: null, ...over });

async function setup(users: User[]) {
  const store = new MemoryIdentityStore();
  for (const u of users) await store.createUser(u);
  const service = await WorkspaceService.open(new MemoryCommandStore());
  const app = await buildApp({
    service, publicOrigin: null, authRoutes: registerDevAuthRoutes,
    authenticate: async (request) => { const u = await store.findUserById(String(request.headers['x-test-user'] ?? '')); return u && u.active ? { id: u.id, name: u.displayName, role: u.role, verified: true } : null; },
    people: (api) => registerPeople(api, store),
  });
  apps.push(app);
  return app;
}

describe('GET /api/people', () => {
  it('gives any signed-in role every user, switched-off included, with only id, name and email', async () => {
    const app = await setup([user('vi', 'viewer'), user('ad', 'admin', { oidcSubject: 's' }), user('gone', 'editor', { active: false })]);
    const res = await app.inject({ method: 'GET', url: '/api/people', headers: { 'x-test-user': 'vi' } });
    expect(res.statusCode).toBe(200);
    const { people } = res.json() as { people: object[] };
    expect(people).toHaveLength(3);
    expect(people).toContainEqual({ id: 'gone', name: 'Name gone', email: 'gone@company.test' });
    expect(people.every((p) => Object.keys(p).sort().join() === 'email,id,name')).toBe(true);
    expect(res.body).not.toMatch(/passwordHash|scrypt|role|source/);
  });

  it('is 401 when signed out', async () => {
    const app = await setup([user('vi', 'viewer')]);
    expect((await app.inject({ method: 'GET', url: '/api/people' })).statusCode).toBe(401);
  });
});
