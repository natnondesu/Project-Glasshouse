import { afterEach, expect, it } from 'vitest';
import { MemoryCommandStore } from '../store/memoryStore';
import { WorkspaceService } from '../workspaceService';
import { buildApp } from './app';
import { devAuthenticate } from './devAuth';

const apps: { close(): Promise<unknown> }[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((a) => a.close()));
});

async function setup(authenticate = devAuthenticate) {
  const service = await WorkspaceService.open(new MemoryCommandStore());
  const app = await buildApp({ service, authenticate });
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
    method: 'POST', url: '/api/commands', headers: { 'x-glasshouse-dev-user': 'Ploy' },
    payload: { clientId: 'a', commands: [{ commandId: '1', command: { type: 'project/create', id: 'p', name: 'Riverside' } }] },
  });
  expect(res.statusCode).toBe(200);
  expect(res.json()).toEqual({ accepted: [{ commandId: '1', seq: 1 }], rejected: null, skipped: [] });
  expect((await service.commandsAfter(0, 10))[0]?.actor).toEqual({ id: 'dev:Ploy', name: 'Ploy' });
  expect((await app.inject({ url: '/api/workspace' })).json()).toMatchObject({ seq: 1, workspace: { projects: [{ name: 'Riverside' }] } });
});

it('answers 400 to a body that is not a list of commands', async () => {
  const { app } = await setup();
  const res = await app.inject({ method: 'POST', url: '/api/commands', payload: { clientId: 'a', commands: 'nope' } });
  expect(res.statusCode).toBe(400);
  expect(res.json()).toMatchObject({ error: { code: 'invalid_value' } });
});

it('accepts a large project import', async () => {
  const { app } = await setup();
  const padding = Array.from({ length: 3000 }, () => 'x'.repeat(1000));
  const res = await app.inject({
    method: 'POST', url: '/api/commands',
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
