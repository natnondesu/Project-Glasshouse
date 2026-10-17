import { OAuth2Server } from 'oauth2-mock-server';
import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import type { AuthConfig } from '../../config';
import { MemoryIdentityStore } from '../../identity/memoryIdentityStore';
import { MemoryCommandStore } from '../../store/memoryStore';
import { WorkspaceService } from '../../workspaceService';
import { buildApp } from '../app';
import { registerAuthRoutes } from './authRoutes';
import { LoginThrottle } from './loginThrottle';
import { createOidcLogin } from './oidc';
import { createSessionAuth, SESSION_COOKIE } from './sessionAuth';

const PUBLIC = 'http://localhost:5399';
let idp: OAuth2Server;
let claims: Record<string, unknown> = {};
const apps: FastifyInstance[] = [];

beforeAll(async () => {
  idp = new OAuth2Server();
  await idp.issuer.keys.generate('RS256');
  await idp.start(0, '127.0.0.1');
  idp.service.on('beforeTokenSigning', (token) => Object.assign(token.payload, claims));
});
afterAll(async () => {
  await idp.stop();
});
afterEach(async () => {
  await Promise.all(apps.splice(0).map((a) => a.close()));
});

async function setup(store = new MemoryIdentityStore()) {
  const config: AuthConfig = { mode: 'on', publicUrl: new URL(PUBLIC), localLogin: false, oidc: { issuer: idp.issuer.url!, clientId: 'glasshouse', clientSecret: 'test-secret' }, bootstrapAdmin: 'few@company.test', defaultRole: 'viewer', secureCookies: false, seedUsers: [] };
  const oidc = await createOidcLogin({ ...config.oidc!, redirectUri: `${PUBLIC}/auth/oidc/callback` });
  const sessions = createSessionAuth(store, { secure: false });
  const service = await WorkspaceService.open(new MemoryCommandStore());
  const app = await buildApp({ service, authenticate: sessions.authenticate, publicOrigin: PUBLIC, authRoutes: (a) => registerAuthRoutes(a, { store, sessions, config, oidc, throttle: new LoginThrottle(), now: () => new Date() }) });
  apps.push(app);
  return { app, store };
}

/** Browser stand-in: start → IdP (auto-approves) → back to our callback. */
async function signIn(app: FastifyInstance, returnTo = '/rooms/r1/plan') {
  const start = await app.inject({ url: `/auth/oidc/start?returnTo=${encodeURIComponent(returnTo)}` });
  expect(start.statusCode).toBe(302);
  const atIdp = await fetch(start.headers.location as string, { redirect: 'manual' });
  const back = new URL(atIdp.headers.get('location')!);
  return app.inject({ url: `${back.pathname}${back.search}` });
}

it('signs a new company user in with the default role and returns them where they were', async () => {
  claims = { sub: 'authelia-ploy', email: 'ploy@company.test', email_verified: true, name: 'Ploy S.' };
  const { app } = await setup();
  const res = await signIn(app);
  expect(res.statusCode).toBe(302);
  expect(res.headers.location).toBe('/rooms/r1/plan');
  const cookie = res.cookies.find((c) => c.name === SESSION_COOKIE)!;
  const me = await app.inject({ url: '/auth/me', headers: { cookie: `${SESSION_COOKIE}=${cookie.value}` } });
  expect(me.json()).toMatchObject({ name: 'Ploy S.', email: 'ploy@company.test', role: 'viewer' });
  expect((await app.inject({ url: '/auth/config' })).json()).toEqual({ mode: 'on', localLogin: false, sso: true });
});

it('makes the bootstrap email an admin', async () => {
  claims = { sub: 'authelia-few', email: 'few@company.test', email_verified: true, name: 'Few' };
  const { app } = await setup();
  const cookie = (await signIn(app)).cookies.find((c) => c.name === SESSION_COOKIE)!;
  expect((await app.inject({ url: '/auth/me', headers: { cookie: `${SESSION_COOKIE}=${cookie.value}` } })).json()).toMatchObject({ role: 'admin' });
});

it('refuses a switched-off user and an unknown or replayed callback', async () => {
  claims = { sub: 'authelia-off', email: 'off@company.test', email_verified: true, name: 'Off' };
  const { app, store } = await setup();
  await signIn(app);
  const user = await store.findUserBySubject('authelia-off');
  await store.updateUser(user!.id, { active: false });
  const refused = await signIn(app);
  expect(refused.headers.location).toMatch(/^\/\?signin_error=/);
  const bogus = await app.inject({ url: '/auth/oidc/callback?code=x&state=not-ours' });
  expect(bogus.headers.location).toMatch(/^\/\?signin_error=/);
});

it('never redirects off-site after sign-in', async () => {
  claims = { sub: 'authelia-r', email: 'r@company.test', email_verified: true, name: 'R' };
  const { app } = await setup();
  expect((await signIn(app, 'https://evil.test/')).headers.location).toBe('/');
  expect((await signIn(app, '//evil.test/x')).headers.location).toBe('/');
});
