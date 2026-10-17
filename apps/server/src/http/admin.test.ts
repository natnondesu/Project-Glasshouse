import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryIdentityStore } from '../identity/memoryIdentityStore';
import type { Role, User } from '../identity/types';
import { MemoryCommandStore } from '../store/memoryStore';
import { WorkspaceService } from '../workspaceService';
import { registerAdmin } from './admin';
import { buildApp } from './app';
import { registerDevAuthRoutes } from './devAuth';

const apps: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((a) => a.close()));
});
const NOW = '2026-10-18T09:00:00.000Z';
const user = (id: string, role: Role, over: Partial<User> = {}): User => ({ id, email: `${id}@company.test`, displayName: id, role, source: 'local', oidcSubject: null, passwordHash: 'x', mustChangePassword: false, active: true, createdAt: NOW, lastLoginAt: null, ...over });

async function setup(as: User, others: User[] = []) {
  const store = new MemoryIdentityStore();
  for (const u of [as, ...others]) await store.createUser(u);
  const service = await WorkspaceService.open(new MemoryCommandStore());
  const app = await buildApp({
    service, publicOrigin: null, authRoutes: registerDevAuthRoutes,
    authenticate: async () => { const u = await store.findUserById(as.id); return u && u.active ? { id: u.id, name: u.displayName, role: u.role, verified: true } : null; },
    admin: (api) => registerAdmin(api, { store, localLogin: true, now: () => new Date(NOW) }),
  });
  apps.push(app);
  const call = (method: 'GET' | 'POST' | 'PATCH', url: string, payload?: object) => app.inject({ method, url, headers: { 'x-glasshouse': '1' }, ...(payload ? { payload } : {}) });
  return { app, store, call };
}

describe('admin users API', () => {
  it('is for admins only', async () => {
    const { call } = await setup(user('ed', 'editor'));
    expect((await call('GET', '/api/admin/users')).statusCode).toBe(403);
  });

  it('lists users without password hashes and creates a local user with a one-time password', async () => {
    const { call, store } = await setup(user('ad', 'admin'));
    const created = await call('POST', '/api/admin/users', { email: 'new@company.test', displayName: 'New Person', role: 'editor' });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ user: { email: 'new@company.test', role: 'editor', source: 'local', mustChangePassword: true }, temporaryPassword: expect.any(String) });
    expect(JSON.stringify((await call('GET', '/api/admin/users')).json())).not.toMatch(/passwordHash|scrypt/);
    expect((await store.findUserByEmail('new@company.test'))?.mustChangePassword).toBe(true);
    expect((await call('POST', '/api/admin/users', { email: 'NEW@company.test', displayName: 'Dup', role: 'viewer' })).statusCode).toBe(409);
  });

  it('switching a user off ends their sessions', async () => {
    const { call, store } = await setup(user('ad', 'admin'), [user('ed', 'editor')]);
    await store.createSession({ tokenHash: 'h', userId: 'ed', createdAt: NOW, lastSeenAt: NOW, expiresAt: '2026-10-25T00:00:00.000Z' });
    expect((await call('PATCH', '/api/admin/users/ed', { active: false })).json()).toMatchObject({ active: false });
    expect(await store.findSession('h')).toBeNull();
  });

  it('never leaves the workspace without an admin', async () => {
    const { call } = await setup(user('ad', 'admin'), [user('ad2', 'admin', { active: false })]);
    expect((await call('PATCH', '/api/admin/users/ad', { role: 'editor' })).statusCode).toBe(409);
    expect((await call('PATCH', '/api/admin/users/ad', { active: false })).statusCode).toBe(409);
  });

  it('resets a local password and refuses it for an SSO user', async () => {
    const { call, store } = await setup(user('ad', 'admin'), [user('ed', 'editor'), user('sso', 'viewer', { source: 'oidc', passwordHash: null, oidcSubject: 's' })]);
    const r = await call('POST', '/api/admin/users/ed/reset-password');
    expect(r.json()).toEqual({ temporaryPassword: expect.any(String) });
    expect((await store.findUserById('ed'))?.mustChangePassword).toBe(true);
    expect((await call('POST', '/api/admin/users/sso/reset-password')).statusCode).toBe(400);
  });
});
