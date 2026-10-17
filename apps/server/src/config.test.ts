import { expect, it } from 'vitest';
import { loadConfig } from './config';

const on = { GLASSHOUSE_AUTH: 'on', GLASSHOUSE_STORE: 'memory', GLASSHOUSE_PUBLIC_URL: 'https://glasshouse.company.test' };

it('refuses to start without an auth mode', () => {
  expect(() => loadConfig({ GLASSHOUSE_STORE: 'memory' })).toThrow(/GLASSHOUSE_AUTH/);
});

it('keeps dev-insecure for local development', () => {
  expect(loadConfig({ GLASSHOUSE_AUTH: 'dev-insecure', GLASSHOUSE_STORE: 'memory' }).auth).toEqual({ mode: 'dev-insecure' });
});

it('needs a database URL for the Postgres store', () => {
  expect(() => loadConfig({ GLASSHOUSE_AUTH: 'dev-insecure' })).toThrow(/DATABASE_URL/);
});

it('reads sign-in settings with safe defaults', () => {
  const c = loadConfig(on);
  expect(c.auth).toMatchObject({ mode: 'on', localLogin: true, oidc: null, bootstrapAdmin: null, defaultRole: 'viewer', secureCookies: true, seedUsers: [] });
  expect(c.auth.mode === 'on' && c.auth.publicUrl.origin).toBe('https://glasshouse.company.test');
});

it('requires a public URL, an https one off localhost, and at least one way to sign in', () => {
  expect(() => loadConfig({ ...on, GLASSHOUSE_PUBLIC_URL: undefined })).toThrow(/GLASSHOUSE_PUBLIC_URL/);
  expect(() => loadConfig({ ...on, GLASSHOUSE_PUBLIC_URL: 'http://glasshouse.company.test' })).toThrow(/https/);
  expect(loadConfig({ ...on, GLASSHOUSE_PUBLIC_URL: 'http://localhost:5399' }).auth).toMatchObject({ secureCookies: false });
  expect(() => loadConfig({ ...on, GLASSHOUSE_LOCAL_LOGIN: 'off' })).toThrow(/at least one/);
});

it('takes OIDC settings all together or not at all', () => {
  expect(() => loadConfig({ ...on, GLASSHOUSE_OIDC_ISSUER: 'https://auth.company.test' })).toThrow(/GLASSHOUSE_OIDC_CLIENT_ID/);
  const c = loadConfig({ ...on, GLASSHOUSE_OIDC_ISSUER: 'https://auth.company.test', GLASSHOUSE_OIDC_CLIENT_ID: 'glasshouse', GLASSHOUSE_OIDC_CLIENT_SECRET: 's3cret', GLASSHOUSE_BOOTSTRAP_ADMIN: 'few@company.test' });
  expect(c.auth).toMatchObject({ oidc: { issuer: 'https://auth.company.test', clientId: 'glasshouse' }, bootstrapAdmin: 'few@company.test' });
});

it('accepts seed users only with the memory store', () => {
  const seed = 'ed@company.test:password-123456:editor:Ed Itor';
  expect(loadConfig({ ...on, GLASSHOUSE_SEED_USERS: seed }).auth).toMatchObject({ seedUsers: [{ email: 'ed@company.test', role: 'editor', displayName: 'Ed Itor' }] });
  expect(() => loadConfig({ ...on, GLASSHOUSE_STORE: 'postgres', DATABASE_URL: 'postgres://x', GLASSHOUSE_SEED_USERS: seed })).toThrow(/memory/);
});
