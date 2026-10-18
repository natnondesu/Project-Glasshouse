import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { MemoryCommandStore } from '../store/memoryStore';
import { WorkspaceService } from '../workspaceService';
import { buildApp } from './app';
import { devAuthenticate, registerDevAuthRoutes, type Authenticate } from './devAuth';

const apps: { close(): Promise<unknown> }[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((a) => a.close()));
});

async function setup(authenticate: Authenticate = devAuthenticate) {
  const service = await WorkspaceService.open(new MemoryCommandStore());
  const app = await buildApp({ service, authenticate, authRoutes: registerDevAuthRoutes, publicOrigin: null });
  apps.push(app);
  return { app, service };
}

it('serves health without auth and the workspace with it', async () => {
  const { app } = await setup(() => null);
  expect((await app.inject({ url: '/api/health' })).json()).toEqual({ ok: true, seq: 0 });
  expect((await app.inject({ url: '/api/workspace' })).statusCode).toBe(401);
});

it('accepts a batch of commands and stamps the actor', async () => {
  const { app, service } = await setup();
  const res = await app.inject({
    method: 'POST', url: '/api/commands', headers: { 'x-glasshouse-dev-user': 'Ploy', 'x-glasshouse': '1' },
    payload: { clientId: 'a', commands: [{ commandId: '1', command: { type: 'project/create', id: 'p', name: 'Riverside' } }] },
  });
  expect(res.statusCode).toBe(200);
  expect(res.json()).toEqual({ accepted: [{ commandId: '1', seq: 1 }], rejected: null, skipped: [] });
  expect((await service.commandsAfter(0, 10))[0]?.actor).toEqual({ id: 'dev:Ploy', name: 'Ploy', role: 'admin', verified: false });
  expect((await app.inject({ url: '/api/workspace' })).json()).toMatchObject({ seq: 1, workspace: { projects: [{ name: 'Riverside' }] } });
});

it('answers 400 to a body that is not a list of commands', async () => {
  const { app } = await setup();
  const res = await app.inject({ method: 'POST', url: '/api/commands', headers: { 'x-glasshouse': '1' }, payload: { clientId: 'a', commands: 'nope' } });
  expect(res.statusCode).toBe(400);
  expect(res.json()).toMatchObject({ error: { code: 'invalid_value' } });
});

it('accepts a large project import', async () => {
  const { app } = await setup();
  const padding = Array.from({ length: 3000 }, () => 'x'.repeat(1000));
  const res = await app.inject({
    method: 'POST', url: '/api/commands', headers: { 'x-glasshouse': '1' },
    payload: { clientId: 'a', commands: [{ commandId: '1', command: { type: 'project/create', id: 'p', name: 'P', padding } }] },
  });
  expect(res.statusCode).toBe(200);
  expect(res.json().accepted).toEqual([{ commandId: '1', seq: 1 }]);
});

it('never serves an API route to an unauthenticated encoded path', async () => {
  const { app } = await setup(() => null);
  expect((await app.inject({ url: '/%61pi/workspace' })).statusCode).not.toBe(200);
  expect((await app.inject({ method: 'POST', url: '/%61pi/commands', payload: {} })).statusCode).not.toBe(200);
});

it('serves health with a query string without auth', async () => {
  const { app } = await setup(() => null);
  expect((await app.inject({ url: '/api/health?x=1' })).statusCode).toBe(200);
});

it('reads the client address from X-Forwarded-For only when a proxy is trusted', async () => {
  const seen: string[] = [];
  for (const trustProxy of [false, 1] as const) {
    const service = await WorkspaceService.open(new MemoryCommandStore());
    const app = await buildApp({ service, authenticate: devAuthenticate, authRoutes: (a) => { a.get('/auth/ip', async (request) => request.ip); }, publicOrigin: null, trustProxy });
    apps.push(app);
    seen.push((await app.inject({ url: '/auth/ip', remoteAddress: '10.0.0.1', headers: { 'x-forwarded-for': '203.0.113.9' } })).body);
  }
  expect(seen).toEqual(['10.0.0.1', '203.0.113.9']);
});

it('serves readiness without auth, and 503 when the database does not answer', async () => {
  const { app } = await setup(() => null);
  const ok = await app.inject({ url: '/api/ready' });
  expect(ok.statusCode).toBe(200);
  expect(ok.json()).toEqual({ ok: true, seq: 0 });

  class Down extends MemoryCommandStore {
    override async ping(): Promise<void> {
      throw new Error('connect ECONNREFUSED');
    }
  }
  const service = await WorkspaceService.open(new Down(), { onError: () => {} });
  const down = await buildApp({ service, authenticate: () => null, authRoutes: registerDevAuthRoutes, publicOrigin: null });
  apps.push(down);
  const res = await down.inject({ url: '/api/ready' });
  expect(res.statusCode).toBe(503);
  expect(res.json()).toEqual({ ok: false, reason: 'The database is not answering.' });
});

it('puts the server generation in the workspace snapshot', async () => {
  const { app, service } = await setup();
  const body = (await app.inject({ url: '/api/workspace' })).json<{ generation: string }>();
  expect(typeof body.generation).toBe('string');
  expect(body.generation).toBe(service.generation);
});

const envelope = (code: string) => ({ error: { code, message: expect.any(String), targets: [] } });
const postRaw = (app: Awaited<ReturnType<typeof setup>>['app'], payload: string, contentType = 'application/json') =>
  app.inject({ method: 'POST', url: '/api/commands', headers: { 'x-glasshouse': '1', 'content-type': contentType }, payload });

it("answers Fastify's own client errors in the app's error envelope", async () => {
  const { app } = await setup();
  const tooBig = await postRaw(app, `{"clientId":"a","commands":[],"pad":"${'x'.repeat(26 * 1024 * 1024)}"}`);
  expect(tooBig.statusCode).toBe(413);
  expect(tooBig.json()).toEqual(envelope('too_large'));
  expect(tooBig.json().error.message).toMatch(/larger than the server accepts \(25 MB\)/);

  const malformed = await postRaw(app, '{"clientId":');
  expect(malformed.statusCode).toBe(400);
  expect(malformed.json()).toEqual(envelope('invalid_value'));

  const wrongType = await postRaw(app, '<a/>', 'application/xml');
  expect(wrongType.statusCode).toBe(415);
  expect(wrongType.json()).toEqual(envelope('invalid_value'));
});

it('leaves server errors to Fastify: a 500 stays a 500', async () => {
  const { app, service } = await setup();
  service.submitBatch = async () => {
    throw new Error('boom');
  };
  const res = await app.inject({ method: 'POST', url: '/api/commands', headers: { 'x-glasshouse': '1' }, payload: { clientId: 'a', commands: [{ commandId: '1', command: { type: 'project/create', id: 'p', name: 'P' } }] } });
  expect(res.statusCode).toBe(500);
});

it('serves the web manifest as a manifest, and a missing static file falls back to the app', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gh-web-'));
  try {
    await writeFile(join(dir, 'index.html'), '<!doctype html><title>app</title>');
    await writeFile(join(dir, 'site.webmanifest'), '{"name":"Glasshouse"}');
    await writeFile(join(dir, 'favicon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"><style>.t{fill:red}</style></svg>');
    const service = await WorkspaceService.open(new MemoryCommandStore());
    const app = await buildApp({ service, authenticate: devAuthenticate, authRoutes: registerDevAuthRoutes, publicOrigin: null, webDir: dir });
    apps.push(app);
    const manifest = await app.inject({ url: '/site.webmanifest' });
    expect(manifest.statusCode).toBe(200);
    expect(String(manifest.headers['content-type'])).toMatch(/^application\/manifest\+json/);
    expect(manifest.headers['x-content-type-options']).toBe('nosniff');
    expect((await app.inject({ url: '/rooms/anything' })).body).toContain('<title>app</title>');
    // Only a served SVG may style itself; a missing .svg falls back to the app and keeps the strict policy.
    expect((await app.inject({ url: '/favicon.svg' })).headers['content-security-policy']).toBe("default-src 'none'; style-src 'unsafe-inline'");
    for (const url of ['/', '/site.webmanifest', '/missing.svg']) expect(String((await app.inject({ url })).headers['content-security-policy']), url).toContain("default-src 'self'");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

it('serves who edited each room last with the workspace', async () => {
  const ada = { id: 'u-ada', name: 'Ada', role: 'admin' as const, verified: true };
  const { app, service } = await setup(async () => ada);
  for (const [i, command] of [
    { type: 'project/create' as const, id: 'p', name: 'P' },
    { type: 'site/create' as const, projectId: 'p', id: 's', name: 'S' },
    { type: 'room/create' as const, siteId: 's', id: 'r', floorAreaId: 'f', name: 'MDF' },
  ].entries()) {
    await service.submit({ clientId: 'a', commandId: String(i), command }, ada);
  }
  const body = (await app.inject({ url: '/api/workspace' })).json();
  expect(body.edits).toEqual([{ roomId: 'r', userId: 'u-ada', name: 'Ada', at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/) }]);
});
