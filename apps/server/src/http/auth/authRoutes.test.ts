import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { MemoryCommandStore } from '../../store/memoryStore';
import { WorkspaceService } from '../../workspaceService';
import { MemoryIdentityStore } from '../../identity/memoryIdentityStore';
import * as passwords from '../../identity/passwords';
import { hashPassword } from '../../identity/passwords';
import type { User } from '../../identity/types';
import { buildApp } from '../app';
import type { AuthConfig } from '../../config';
import { createSessionAuth, SESSION_COOKIE, SESSION_IDLE_MS } from './sessionAuth';
import { LoginThrottle, MAX_FAILURES, MAX_FAILURES_PER_IP } from './loginThrottle';
import { registerAuthRoutes } from './authRoutes';

vi.mock('../../identity/passwords', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../identity/passwords')>();
  return { ...actual, verifyPassword: vi.fn(actual.verifyPassword) };
});

const PUBLIC = 'https://glasshouse.company.test';
const apps: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((a) => a.close()));
});

const config: AuthConfig = { mode: 'on', publicUrl: new URL(PUBLIC), localLogin: true, oidc: null, bootstrapAdmin: null, defaultRole: 'viewer', secureCookies: true, seedUsers: [] };

async function setup(users: Partial<User>[] = [{}]) {
  let clock = new Date('2026-10-18T09:00:00.000Z');
  const store = new MemoryIdentityStore();
  for (const [i, over] of users.entries()) {
    await store.createUser({
      id: `u${i}`, email: `user${i}@company.test`, displayName: `User ${i}`, role: 'editor', source: 'local', oidcSubject: null,
      passwordHash: await hashPassword('password-123456'), mustChangePassword: false, active: true, createdAt: clock.toISOString(), lastLoginAt: null, ...over,
    });
  }
  const sessions = createSessionAuth(store, { secure: true, now: () => clock });
  const service = await WorkspaceService.open(new MemoryCommandStore());
  const app = await buildApp({
    service, authenticate: sessions.authenticate, publicOrigin: PUBLIC,
    authRoutes: (a) => registerAuthRoutes(a, { store, sessions, config, oidc: null, throttle: new LoginThrottle(), now: () => clock }),
  });
  apps.push(app);
  return { app, store, advance: (ms: number) => (clock = new Date(clock.getTime() + ms)) };
}

const login = (app: FastifyInstance, email: string, password: string, remoteAddress?: string) =>
  app.inject({ method: 'POST', url: '/auth/login', headers: { 'x-glasshouse': '1', origin: PUBLIC }, payload: { email, password }, remoteAddress });
const cookieOf = (res: { cookies: { name: string; value: string }[] }) => {
  const c = res.cookies.find((x) => x.name === SESSION_COOKIE);
  return c ? `${SESSION_COOKIE}=${c.value}` : '';
};

describe('local sign-in', () => {
  it('says which ways to sign in exist', async () => {
    const { app } = await setup();
    expect((await app.inject({ url: '/auth/config' })).json()).toEqual({ mode: 'on', localLogin: true, sso: false });
  });

  it('signs in with the right password only, and the cookie opens the API', async () => {
    const { app } = await setup();
    expect((await login(app, 'user0@company.test', 'wrong-password-1')).statusCode).toBe(401);
    expect((await app.inject({ url: '/api/workspace' })).statusCode).toBe(401);
    const res = await login(app, 'USER0@company.test', 'password-123456');
    expect(res.statusCode).toBe(200);
    const raw = res.headers['set-cookie'];
    expect(String(raw)).toMatch(/HttpOnly/i);
    expect(String(raw)).toMatch(/SameSite=Lax/i);
    expect(String(raw)).toMatch(/Secure/i);
    expect((await app.inject({ url: '/api/workspace', headers: { cookie: cookieOf(res) } })).statusCode).toBe(200);
    expect((await app.inject({ url: '/auth/me', headers: { cookie: cookieOf(res) } })).json()).toMatchObject({ name: 'User 0', role: 'editor' });
  });

  it('gives the same answer for an unknown email and a wrong password', async () => {
    const { app } = await setup();
    const a = await login(app, 'nobody@company.test', 'password-123456');
    const b = await login(app, 'user0@company.test', 'wrong-password-1');
    expect([a.statusCode, b.statusCode]).toEqual([401, 401]);
    expect(a.json()).toEqual(b.json());
  });

  it('refuses changes without the X-Glasshouse header or from another origin', async () => {
    const { app } = await setup();
    const cookie = cookieOf(await login(app, 'user0@company.test', 'password-123456'));
    const body = { clientId: 'c', commands: [{ commandId: '1', command: { type: 'project/create', id: 'p', name: 'P' } }] };
    expect((await app.inject({ method: 'POST', url: '/api/commands', headers: { cookie }, payload: body })).statusCode).toBe(403);
    expect((await app.inject({ method: 'POST', url: '/api/commands', headers: { cookie, 'x-glasshouse': '1', origin: 'https://evil.test' }, payload: body })).statusCode).toBe(403);
    expect((await app.inject({ method: 'POST', url: '/api/commands', headers: { cookie, 'x-glasshouse': '1', origin: PUBLIC }, payload: body })).statusCode).toBe(200);
  });

  it('makes a new user change the temporary password before anything else', async () => {
    const { app } = await setup([{ mustChangePassword: true }]);
    const first = await login(app, 'user0@company.test', 'password-123456');
    expect(first.json()).toEqual({ mustChangePassword: true });
    const cookie = cookieOf(first);
    expect((await app.inject({ url: '/api/workspace', headers: { cookie } })).json()).toMatchObject({ error: { code: 'password_change_required' } });
    const short = await app.inject({ method: 'POST', url: '/auth/password', headers: { cookie, 'x-glasshouse': '1' }, payload: { current: 'password-123456', next: 'short' } });
    expect(short.statusCode).toBe(400);
    const changed = await app.inject({ method: 'POST', url: '/auth/password', headers: { cookie, 'x-glasshouse': '1' }, payload: { current: 'password-123456', next: 'a-new-long-password' } });
    expect(changed.statusCode).toBe(204);
    expect((await app.inject({ url: '/api/workspace', headers: { cookie } })).statusCode).toBe(401);
    expect((await app.inject({ url: '/api/workspace', headers: { cookie: cookieOf(changed) } })).statusCode).toBe(200);
  });

  it('slows down guessing', async () => {
    const { app } = await setup();
    for (let i = 0; i < MAX_FAILURES; i += 1) await login(app, 'user0@company.test', 'wrong-password-1');
    expect((await login(app, 'user0@company.test', 'password-123456')).statusCode).toBe(429);
  });

  it('stops one address spraying across many emails, without touching other addresses', async () => {
    const { app } = await setup();
    for (let i = 0; i < MAX_FAILURES_PER_IP; i += 1) await login(app, `nobody${i}@company.test`, 'wrong-password-1', '10.1.1.1');
    expect((await login(app, 'user0@company.test', 'password-123456', '10.1.1.1')).statusCode).toBe(429);
    expect((await login(app, 'user0@company.test', 'password-123456', '10.2.2.2')).statusCode).toBe(200);
  });

  it('still checks a password when there is no account to check, so timing does not give accounts away', async () => {
    const { app, store } = await setup([{}, { source: 'oidc', passwordHash: null }, { active: false }]);
    const verify = vi.mocked(passwords.verifyPassword);
    for (const email of ['nobody@company.test', 'user1@company.test', 'user2@company.test']) {
      verify.mockClear();
      expect((await login(app, email, 'password-123456')).statusCode).toBe(401);
      expect(verify).toHaveBeenCalledTimes(1);
    }
    expect(await store.findUserByEmail('user2@company.test')).toMatchObject({ active: false });
  });

  it('refuses a new password equal to the current one', async () => {
    const { app } = await setup([{ mustChangePassword: true }]);
    const cookie = cookieOf(await login(app, 'user0@company.test', 'password-123456'));
    const same = await app.inject({ method: 'POST', url: '/auth/password', headers: { cookie, 'x-glasshouse': '1' }, payload: { current: 'password-123456', next: 'password-123456' } });
    expect(same.statusCode).toBe(400);
    expect(same.json()).toMatchObject({ error: { message: 'Choose a password different from the current one.' } });
    expect((await app.inject({ url: '/api/workspace', headers: { cookie } })).statusCode).toBe(403);
  });

  it('slows down guessing the current password', async () => {
    const { app } = await setup();
    const cookie = cookieOf(await login(app, 'user0@company.test', 'password-123456'));
    const change = (current: string) => app.inject({ method: 'POST', url: '/auth/password', headers: { cookie, 'x-glasshouse': '1' }, payload: { current, next: 'a-new-long-password' } });
    for (let i = 0; i < MAX_FAILURES; i += 1) expect((await change('wrong-password-1')).statusCode).toBe(400);
    expect((await change('password-123456')).statusCode).toBe(429);
  });

  it('a signed-out or expired session is refused', async () => {
    const { app, advance } = await setup();
    const cookie = cookieOf(await login(app, 'user0@company.test', 'password-123456'));
    const out = await app.inject({ method: 'POST', url: '/auth/logout', headers: { cookie, 'x-glasshouse': '1' } });
    expect(out.statusCode).toBe(204);
    expect((await app.inject({ url: '/api/workspace', headers: { cookie } })).statusCode).toBe(401);
    const again = cookieOf(await login(app, 'user0@company.test', 'password-123456'));
    advance(SESSION_IDLE_MS + 1000);
    expect((await app.inject({ url: '/api/workspace', headers: { cookie: again } })).statusCode).toBe(401);
  });

  it('refuses a switched-off user', async () => {
    const { app, store } = await setup();
    const cookie = cookieOf(await login(app, 'user0@company.test', 'password-123456'));
    await store.updateUser('u0', { active: false });
    expect((await app.inject({ url: '/api/workspace', headers: { cookie } })).statusCode).toBe(401);
    expect((await login(app, 'user0@company.test', 'password-123456')).statusCode).toBe(401);
  });
});
