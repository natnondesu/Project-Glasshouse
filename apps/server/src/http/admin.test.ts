import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryIdentityStore } from '../identity/memoryIdentityStore';
import type { Role, User } from '../identity/types';
import { MemoryCommandStore } from '../store/memoryStore';
import { WorkspaceService } from '../workspaceService';
import { BACKUP_FORMAT, parseBackup } from '@glasshouse/domain';
import { registerAdmin } from './admin';
import { buildApp } from './app';
import { registerDevAuthRoutes } from './devAuth';

const apps: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((a) => a.close()));
});
const NOW = '2026-10-18T09:00:00.000Z';
const user = (id: string, role: Role, over: Partial<User> = {}): User => ({ id, email: `${id}@company.test`, displayName: id, role, source: 'local', oidcSubject: null, passwordHash: 'x', mustChangePassword: false, nameLocked: false, active: true, createdAt: NOW, lastLoginAt: null, ...over });

/** A real database yields between the count and the write; give the memory store the same gap. */
class SlowCountStore extends MemoryIdentityStore {
  override async countActiveAdmins(): Promise<number> {
    const n = await super.countActiveAdmins();
    await new Promise((resolve) => setTimeout(resolve, 5));
    return n;
  }
}

async function setup(as: User, others: User[] = []) {
  const store = new SlowCountStore();
  for (const u of [as, ...others]) await store.createUser(u);
  const service = await WorkspaceService.open(new MemoryCommandStore());
  const app = await buildApp({
    service, publicOrigin: null, authRoutes: registerDevAuthRoutes,
    authenticate: async (request) => { const u = await store.findUserById(String(request.headers['x-test-user'] ?? as.id)); return u && u.active ? { id: u.id, name: u.displayName, role: u.role, verified: true } : null; },
    admin: (api) => registerAdmin(api, { store, service, localLogin: true, now: () => new Date(NOW) }),
  });
  apps.push(app);
  const call = (method: 'GET' | 'POST' | 'PATCH', url: string, payload?: object, asUser?: string) => app.inject({ method, url, headers: { 'x-glasshouse': '1', ...(asUser ? { 'x-test-user': asUser } : {}) }, ...(payload ? { payload } : {}) });
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

  it('two admins demoting each other at once leave exactly one admin', async () => {
    const { call, store } = await setup(user('a', 'admin'), [user('b', 'admin')]);
    const results = await Promise.all([call('PATCH', '/api/admin/users/b', { role: 'editor' }, 'a'), call('PATCH', '/api/admin/users/a', { role: 'editor' }, 'b')]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 409]);
    expect(await store.countActiveAdmins()).toBe(1);
  });

  it('resets a local password and refuses it for an SSO user', async () => {
    const { call, store } = await setup(user('ad', 'admin'), [user('ed', 'editor'), user('sso', 'viewer', { source: 'oidc', passwordHash: null, oidcSubject: 's' })]);
    const r = await call('POST', '/api/admin/users/ed/reset-password');
    expect(r.json()).toEqual({ temporaryPassword: expect.any(String) });
    expect((await store.findUserById('ed'))?.mustChangePassword).toBe(true);
    expect((await call('POST', '/api/admin/users/sso/reset-password')).statusCode).toBe(400);
  });

  it('resets with no content-type and no body, as the web app sends it; a JSON content-type with no body is refused by Fastify', async () => {
    const { app } = await setup(user('ad', 'admin'), [user('ed', 'editor')]);
    const bodiless = await app.inject({ method: 'POST', url: '/api/admin/users/ed/reset-password', headers: { 'x-glasshouse': '1' } });
    expect(bodiless.statusCode).toBe(200);
    expect(bodiless.json()).toEqual({ temporaryPassword: expect.any(String) });
    const withType = await app.inject({ method: 'POST', url: '/api/admin/users/ed/reset-password', headers: { 'x-glasshouse': '1', 'content-type': 'application/json' } });
    expect(withType.statusCode).toBe(400);
    expect(withType.json()).toMatchObject({ code: 'FST_ERR_CTP_EMPTY_JSON_BODY' });
  });
  it('setting a name locks it; a role-only change leaves the lock alone', async () => {
    const { call, store } = await setup(user('ad', 'admin'), [user('ed', 'editor')]);
    const named = await call('PATCH', '/api/admin/users/ed', { displayName: 'Ploy Sriwan' });
    expect(named.statusCode).toBe(200);
    expect(named.json()).toMatchObject({ displayName: 'Ploy Sriwan', nameLocked: true });
    await store.updateUser('ed', { nameLocked: false });
    const roleOnly = await call('PATCH', '/api/admin/users/ed', { role: 'reviewer' });
    expect(roleOnly.json()).toMatchObject({ role: 'reviewer', nameLocked: false });
  });

  it('downloads a workspace backup as an attachment, for admins only', async () => {
    const { call } = await setup(user('ad', 'admin'), [user('ed', 'editor')]);
    const res = await call('GET', '/api/admin/backup');
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-disposition']).toMatch(/attachment; filename="glasshouse-backup-\d{4}-\d{2}-\d{2}\.json"/);
    expect(res.json().format).toBe(BACKUP_FORMAT);
    expect(parseBackup(res.json()).ok).toBe(true);
    expect((await call('GET', '/api/admin/backup', undefined, 'ed')).statusCode).toBe(403);
  });
});
