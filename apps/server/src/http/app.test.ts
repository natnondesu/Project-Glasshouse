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
