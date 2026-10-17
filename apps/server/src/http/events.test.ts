import type { FastifyInstance } from 'fastify';
import { afterEach, expect, it, vi } from 'vitest';
import { MemoryCommandStore } from '../store/memoryStore';
import { WorkspaceService } from '../workspaceService';
import { buildApp } from './app';
import { devAuthenticate, registerDevAuthRoutes } from './devAuth';
import { MAX_CATCH_UP } from './events';

let app: FastifyInstance | null = null;
afterEach(async () => {
  await app?.close();
  app = null;
});

const actor = { id: 'dev:t', name: 't', role: 'editor' as const, verified: false };

async function start(service: WorkspaceService, heartbeatMs?: number): Promise<string> {
  app = await buildApp({ service, authenticate: devAuthenticate, authRoutes: registerDevAuthRoutes, publicOrigin: null, heartbeatMs });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.server.address();
  if (address === null || typeof address === 'string') throw new Error('no port');
  return `http://127.0.0.1:${address.port}`;
}

/** Reads the stream until `until` matches the text so far, then aborts. */
async function readEvents(url: string, until: (text: string) => boolean, init: RequestInit = {}): Promise<string> {
  const controller = new AbortController();
  const res = await fetch(url, { ...init, signal: controller.signal });
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let text = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
    if (until(text)) break;
  }
  controller.abort();
  return text;
}

const create = (i: number) => ({ clientId: 'a', commandId: String(i), command: { type: 'project/create' as const, id: `p${i}`, name: `P${i}` } });

it('sends what the client missed, then live commands, in order', async () => {
  const service = await WorkspaceService.open(new MemoryCommandStore());
  await service.submit(create(1), actor);
  await service.submit(create(2), actor);
  const base = await start(service);
  const reading = readEvents(`${base}/api/events?after=1`, (t) => t.includes('id: 3'));
  await new Promise((r) => setTimeout(r, 100));
  await service.submit(create(3), actor);
  const text = await reading;
  expect([...text.matchAll(/id: (\d+)/g)].map((m) => Number(m[1]))).toEqual([2, 3]);
  expect(text).toContain('event: command');
});

it('honours Last-Event-ID on reconnect', async () => {
  const service = await WorkspaceService.open(new MemoryCommandStore());
  for (const i of [1, 2, 3]) await service.submit(create(i), actor);
  const base = await start(service);
  const text = await readEvents(`${base}/api/events?after=0`, (t) => t.includes('id: 3'), { headers: { 'last-event-id': '2' } });
  expect([...text.matchAll(/id: (\d+)/g)].map((m) => Number(m[1]))).toEqual([3]);
});

it('tells a far-behind client to resync', async () => {
  const service = await WorkspaceService.open(new MemoryCommandStore());
  for (let i = 1; i <= MAX_CATCH_UP + 1; i += 1) await service.submit(create(i), actor);
  const base = await start(service);
  const text = await readEvents(`${base}/api/events?after=0`, (t) => t.includes('event: resync'));
  expect(text).toContain('event: resync');
  expect(text).not.toContain('event: command');
});

it('tells a client ahead of the server to resync', async () => {
  const service = await WorkspaceService.open(new MemoryCommandStore());
  const base = await start(service);
  const text = await readEvents(`${base}/api/events?after=50`, (t) => t.includes('event: resync'));
  expect(text).toContain('event: resync');
});

it('answers 400 when the client does not say where it is', async () => {
  const service = await WorkspaceService.open(new MemoryCommandStore());
  const base = await start(service);
  expect((await fetch(`${base}/api/events`)).status).toBe(400);
});

it('tells the client to resync, and ends the stream, when the backlog cannot be read', async () => {
  const service = await WorkspaceService.open(new MemoryCommandStore());
  vi.spyOn(service, 'commandsAfter').mockRejectedValue(new Error('db down'));
  const base = await start(service);
  const res = await fetch(`${base}/api/events?after=0`);
  const text = await res.text();
  expect(text).toContain('event: resync');
});

it('sends the response headers at once, before any command', async () => {
  const service = await WorkspaceService.open(new MemoryCommandStore());
  const base = await start(service);
  const controller = new AbortController();
  const res = await Promise.race([
    fetch(`${base}/api/events?after=0`, { signal: controller.signal }),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('headers not sent within 1 s')), 1000)),
  ]);
  controller.abort();
  expect(res.status).toBe(200);
  expect(res.headers.get('content-type')).toContain('text/event-stream');
});

it('sends ping events as a heartbeat the browser can see', async () => {
  const service = await WorkspaceService.open(new MemoryCommandStore());
  const base = await start(service, 50);
  const text = await readEvents(`${base}/api/events?after=0`, (t) => (t.match(/event: ping\ndata: \{\}\n\n/g) ?? []).length >= 2);
  expect(text).toContain('event: ping\ndata: {}\n\n');
});
