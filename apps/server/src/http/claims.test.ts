import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { ClaimRegistry } from '../claims';
import { MemoryIdentityStore } from '../identity/memoryIdentityStore';
import type { Role, User } from '../identity/types';
import { MemoryCommandStore } from '../store/memoryStore';
import { WorkspaceService } from '../workspaceService';
import { buildApp } from './app';
import { registerDevAuthRoutes } from './devAuth';

const apps: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((a) => a.close()));
});
const NOW = '2026-10-18T09:00:00.000Z';
const user = (id: string, role: Role, displayName: string): User => ({ id, email: `${id}@company.test`, displayName, role, source: 'local', oidcSubject: null, passwordHash: 'x', mustChangePassword: false, active: true, createdAt: NOW, lastLoginAt: null });

async function setup() {
  const store = new MemoryIdentityStore();
  const people = { ploy: user('ploy', 'editor', 'Ploy'), eddie: user('eddie', 'editor', 'Eddie'), vee: user('vee', 'viewer', 'Vee'), ada: user('ada', 'admin', 'Ada') };
  for (const u of Object.values(people)) await store.createUser(u);
  const claims = new ClaimRegistry();
  const service = await WorkspaceService.open(new MemoryCommandStore(), { claims });
  const as = (u: User) => ({ id: u.id, name: u.displayName, role: u.role, verified: true });
  const setupCommands = [
    { type: 'project/create', id: 'p', name: 'P' },
    { type: 'site/create', projectId: 'p', id: 's', name: 'S' },
    { type: 'room/create', siteId: 's', id: 'r', floorAreaId: 'fa-r', name: 'MDF-1' },
  ] as const;
  for (const [i, command] of setupCommands.entries()) await service.submit({ clientId: 'seed', commandId: `s${i}`, command }, as(people.ploy));
  const app = await buildApp({
    service, publicOrigin: null, authRoutes: registerDevAuthRoutes,
    authenticate: async (request) => { const u = await store.findUserById(String(request.headers['x-test-user'])); return u && u.active ? as(u) : null; },
    claims,
  });
  apps.push(app);
  const call = (method: 'GET' | 'POST' | 'DELETE', url: string, asUser: User | null, headers: Record<string, string> = { 'x-glasshouse': '1' }) =>
    app.inject({ method, url, headers: { ...headers, ...(asUser ? { 'x-test-user': asUser.id } : {}) } });
  return { people, claims, call };
}

describe('room claims API', () => {
  it('lets an editor claim a free room', async () => {
    const { people, call } = await setup();
    const res = await call('POST', '/api/claims/r', people.ploy);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ claim: { roomId: 'r', userId: 'ploy', name: 'Ploy' } });
  });

  it('refuses a second editor with the holder’s name and the idle rule', async () => {
    const { people, call } = await setup();
    await call('POST', '/api/claims/r', people.ploy);
    const res = await call('POST', '/api/claims/r', people.eddie);
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ error: { code: 'claimed', targets: ['r'], message: expect.stringMatching(/Ploy is editing this room.*15 minutes/) } });
  });

  it('lets an admin take over at any time', async () => {
    const { people, claims, call } = await setup();
    await call('POST', '/api/claims/r', people.ploy);
    expect((await call('POST', '/api/claims/r', people.ada)).statusCode).toBe(200);
    expect(claims.holder('r')).toMatchObject({ userId: 'ada' });
  });

  it('refuses a viewer, and an unknown room', async () => {
    const { people, call } = await setup();
    const viewer = await call('POST', '/api/claims/r', people.vee);
    expect(viewer.statusCode).toBe(403);
    expect(viewer.json()).toMatchObject({ error: { code: 'forbidden' } });
    const missing = await call('POST', '/api/claims/nope', people.ploy);
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toMatchObject({ error: { code: 'not_found' } });
  });

  it('lets an admin release anyone’s claim, and a stranger’s release changes nothing', async () => {
    const { people, claims, call } = await setup();
    await call('POST', '/api/claims/r', people.ploy);
    expect((await call('DELETE', '/api/claims/r', people.eddie)).statusCode).toBe(204);
    expect(claims.holder('r')).not.toBeNull();
    expect((await call('DELETE', '/api/claims/r', people.ada)).statusCode).toBe(204);
    expect((await call('GET', '/api/workspace', people.ada)).json()).toMatchObject({ claims: [] });
  });

  it('serves the current claims with the workspace', async () => {
    const { people, call } = await setup();
    await call('POST', '/api/claims/r', people.ploy);
    expect((await call('GET', '/api/workspace', people.eddie)).json()).toMatchObject({ seq: 3, claims: [{ roomId: 'r', userId: 'ploy' }] });
  });

  it('sits behind the CSRF check of the API plugin', async () => {
    const { people, call } = await setup();
    const res = await call('POST', '/api/claims/r', people.ploy, {});
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ error: { code: 'csrf' } });
  });
});
