import { OAuth2Server } from 'oauth2-mock-server';
import type { FastifyInstance } from 'fastify';
import { Writable } from 'node:stream';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { AuthConfig } from '../../config';
import { MemoryIdentityStore } from '../../identity/memoryIdentityStore';
import { MemoryCommandStore } from '../../store/memoryStore';
import { WorkspaceService } from '../../workspaceService';
import { buildApp } from '../app';
import { registerAuthRoutes } from './authRoutes';
import { LoginThrottle } from './loginThrottle';
import { createOidcLogin, safeReturnTo } from './oidc';
import { createSessionAuth, SESSION_COOKIE } from './sessionAuth';

const PUBLIC = 'http://localhost:5399';
let idp: OAuth2Server;
let claims: Record<string, unknown> = {};
let userinfo: Record<string, unknown> | null = null;
let tokenAuthHeader: string | undefined;
const apps: FastifyInstance[] = [];

beforeAll(async () => {
  idp = new OAuth2Server();
  await idp.issuer.keys.generate('RS256');
  await idp.start(0, '127.0.0.1');
  idp.service.on('beforeTokenSigning', (token, req) => {
    tokenAuthHeader = req.headers.authorization;
    Object.assign(token.payload, claims);
  });
  idp.service.on('beforeUserinfo', (response) => {
    if (userinfo) response.body = { ...userinfo };
  });
});
afterAll(async () => {
  await idp.stop();
});
afterEach(async () => {
  userinfo = null;
  await Promise.all(apps.splice(0).map((a) => a.close()));
});

async function setup(store = new MemoryIdentityStore(), logStream?: Writable) {
  const config: AuthConfig = { mode: 'on', publicUrl: new URL(PUBLIC), localLogin: false, oidc: { issuer: idp.issuer.url!, clientId: 'glasshouse', clientSecret: 'test-secret' }, bootstrapAdmin: 'few@company.test', defaultRole: 'viewer', secureCookies: false, seedUsers: [] };
  const oidc = await createOidcLogin({ ...config.oidc!, redirectUri: `${PUBLIC}/auth/oidc/callback` });
  const sessions = createSessionAuth(store, { secure: false });
  const service = await WorkspaceService.open(new MemoryCommandStore());
  const app = await buildApp({ service, logStream, authenticate: sessions.authenticate, publicOrigin: PUBLIC, authRoutes: (a) => registerAuthRoutes(a, { store, sessions, config, oidc, throttle: new LoginThrottle(), now: () => new Date() }) });
  apps.push(app);
  return { app, store };
}

/**
 * Browser stand-in: start → IdP (auto-approves) → back to our callback.
 * `binding` is the gh_oidc cookie sent with the callback: by default the one start set.
 */
async function signIn(app: FastifyInstance, returnTo = '/rooms/r1/plan', binding?: string | null) {
  const start = await app.inject({ url: `/auth/oidc/start?returnTo=${encodeURIComponent(returnTo)}` });
  expect(start.statusCode).toBe(302);
  const atIdp = await fetch(start.headers.location as string, { redirect: 'manual' });
  const back = new URL(atIdp.headers.get('location')!);
  const sent = binding === undefined ? start.cookies.find((c) => c.name === 'gh_oidc')!.value : binding;
  return app.inject({ url: `${back.pathname}${back.search}`, headers: sent === null ? {} : { cookie: `gh_oidc=${sent}` } });
}

const refusedWith = (res: { headers: Record<string, unknown> }, message: RegExp) => {
  const location = String(res.headers.location);
  expect(location).toMatch(/^\/\?signin_error=/);
  expect(decodeURIComponent(location.split('=')[1]!)).toMatch(message);
};

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

it('refuses a callback from another browser, even with a valid state', async () => {
  claims = { sub: 'authelia-csrf', email: 'csrf@company.test', email_verified: true, name: 'Csrf' };
  const { app, store } = await setup();
  refusedWith(await signIn(app, '/', null), /expired/);
  refusedWith(await signIn(app, '/', 'someone-elses-value'), /expired/);
  expect(await store.findUserBySubject('authelia-csrf')).toBeNull();
});

it('sets a narrow binding cookie at start and clears it at the callback', async () => {
  claims = { sub: 'authelia-c', email: 'c@company.test', email_verified: true, name: 'C' };
  const { app } = await setup();
  const start = await app.inject({ url: '/auth/oidc/start' });
  expect(start.cookies.find((c) => c.name === 'gh_oidc')).toMatchObject({ httpOnly: true, sameSite: 'Lax', path: '/auth/oidc', maxAge: 600 });
  const done = await signIn(app);
  expect(done.cookies.find((c) => c.name === 'gh_oidc')).toMatchObject({ value: '', path: '/auth/oidc' });
});

it('shows a fixed message for IdP errors and never echoes the raw value', async () => {
  const { app } = await setup();
  refusedWith(await app.inject({ url: '/auth/oidc/callback?error=access_denied&state=x' }), /cancelled/);
  refusedWith(await app.inject({ url: '/auth/oidc/callback?error=login_required&state=x' }), /Sign in at the company/);
  refusedWith(await app.inject({ url: '/auth/oidc/callback?error=server_error&state=x' }), /unavailable/);
  const unknown = await app.inject({ url: '/auth/oidc/callback?error=%3Cb%3Ebuy-now%3C%2Fb%3E&error_description=evil&state=x' });
  refusedWith(unknown, /^The company sign-in refused this request\.$/);
  expect(decodeURIComponent(String(unknown.headers.location))).not.toMatch(/buy-now|evil/);
});

it('refuses to redirect off-site through whitespace, backslash or dot-segment tricks', async () => {
  claims = { sub: 'authelia-x', email: 'x@company.test', email_verified: true, name: 'X' };
  const { app } = await setup();
  for (const bad of ['/\t/evil.com', '/\n/evil.com', '/\r/evil.com', '/\\evil.com', '/..//evil.com', '/.//evil.com', '/ /evil.com']) {
    expect((await signIn(app, bad)).headers.location).toBe('/');
  }
});

it('reads email and name from userinfo when the ID token has neither', async () => {
  claims = { sub: 'authelia-ui' };
  userinfo = { sub: 'authelia-ui', email: 'ui@company.test', email_verified: true, name: 'Userinfo Person' };
  const { app } = await setup();
  const cookie = (await signIn(app)).cookies.find((c) => c.name === SESSION_COOKIE)!;
  const me = await app.inject({ url: '/auth/me', headers: { cookie: `${SESSION_COOKIE}=${cookie.value}` } });
  expect(me.json()).toMatchObject({ name: 'Userinfo Person', email: 'ui@company.test' });
});

it('signs in with what the ID token had when userinfo fails', async () => {
  claims = { sub: 'authelia-uf', name: 'Token Only' };
  userinfo = { sub: 'somebody-else', email: 'wrong@company.test', email_verified: true };
  const { app } = await setup();
  const res = await signIn(app);
  const cookie = res.cookies.find((c) => c.name === SESSION_COOKIE)!;
  const me = await app.inject({ url: '/auth/me', headers: { cookie: `${SESSION_COOKIE}=${cookie.value}` } });
  expect(me.json()).toMatchObject({ name: 'Token Only' });
  expect(me.json().email).not.toBe('wrong@company.test');
});

it('authenticates to the token endpoint with client_secret_basic', async () => {
  claims = { sub: 'authelia-b', email: 'b@company.test', email_verified: true, name: 'B' };
  const { app } = await setup();
  await signIn(app);
  expect(tokenAuthHeader).toMatch(/^Basic /);
});

it('keeps the one-time code and state out of the request log', async () => {
  claims = { sub: 'authelia-log', email: 'log@company.test', email_verified: true, name: 'Log' };
  let logged = '';
  const stream = new Writable({ write(chunk, _enc, done) { logged += String(chunk); done(); } });
  const { app } = await setup(new MemoryIdentityStore(), stream);
  await signIn(app, '/rooms/r1/plan');
  await app.close();
  expect(logged).toContain('/auth/oidc/callback');
  expect(logged).not.toMatch(/code=|state=|returnTo/);
});

describe('safeReturnTo', () => {
  it.each(['/', '/rooms/r1/plan', '/rooms/r1?tab=plan#x'])('keeps the same-site path %s', (path) => {
    expect(safeReturnTo(path)).toBe(path);
  });
  it.each(['https://evil.test/', '//evil.test/x', '/\\evil.test', '/\t/evil.com', '/\n/evil.com', '/\u0000/x', '/..//evil.com', '/.//evil.com', 'evil', '', 42, null])('falls back to / for %j', (value) => {
    expect(safeReturnTo(value)).toBe('/');
  });
  it('leaves percent-encoded look-alikes encoded, so they stay a harmless path', () => {
    expect(safeReturnTo('/%09/evil.com')).toBe('/%09/evil.com');
    expect(safeReturnTo('/%2F/evil.com')).toBe('/%2F/evil.com');
  });
});
