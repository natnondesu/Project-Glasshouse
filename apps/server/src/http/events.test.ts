import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClaimRegistry } from '../claims';
import type { AuthConfig } from '../config';
import { MemoryIdentityStore } from '../identity/memoryIdentityStore';
import { MemoryCommandStore } from '../store/memoryStore';
import { WorkspaceService } from '../workspaceService';
import { buildApp } from './app';
import { registerAuthRoutes } from './auth/authRoutes';
import { LoginThrottle } from './auth/loginThrottle';
import { createSessionAuth, SESSION_COOKIE, SESSION_IDLE_MS } from './auth/sessionAuth';
import { hashToken } from '../identity/tokens';
import { devAuthenticate, registerDevAuthRoutes } from './devAuth';
import { MAX_CATCH_UP } from './events';

let app: FastifyInstance | null = null;
afterEach(async () => {
  await app?.close();
  app = null;
});

const actor = { id: 'dev:t', name: 't', role: 'editor' as const, verified: false };

async function start(service: WorkspaceService, heartbeatMs?: number, claims?: ClaimRegistry): Promise<string> {
  app = await buildApp({ service, authenticate: devAuthenticate, authRoutes: registerDevAuthRoutes, publicOrigin: null, heartbeatMs, claims });
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

it('sends the current claims after the backlog, then again on every change', async () => {
  const claims = new ClaimRegistry();
  claims.touch('r', { id: 'p', name: 'Ploy' });
  const service = await WorkspaceService.open(new MemoryCommandStore(), { claims });
  const base = await start(service, undefined, claims);
  const reading = readEvents(`${base}/api/events?after=0`, (t) => (t.match(/event: claims/g) ?? []).length >= 2);
  await new Promise((r) => setTimeout(r, 100));
  claims.touch('q', { id: 'u', name: 'U' });
  const text = await reading;
  const frames = [...text.matchAll(/event: claims\ndata: (.*)\n/g)].map((m) => JSON.parse(m[1]!) as { claims: { roomId: string; userId: string }[] });
  expect(frames[0]!.claims.map((c) => c.userId)).toEqual(['p']);
  expect(frames[1]!.claims.map((c) => c.userId)).toEqual(['p', 'u']);
});

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

describe('a stream ends when the person behind it no longer has access', () => {
  const NOW = '2026-10-18T09:00:00.000Z';
  const PUBLIC = 'https://glasshouse.company.test';
  const config: AuthConfig = { mode: 'on', publicUrl: new URL(PUBLIC), localLogin: true, oidc: null, bootstrapAdmin: null, defaultRole: 'viewer', secureCookies: true, seedUsers: [] };

  async function signedIn(clock = { now: new Date(NOW) }) {
    const store = new MemoryIdentityStore();
    await store.createUser({ id: 'u1', email: 'u1@company.test', displayName: 'U One', role: 'editor', source: 'local', oidcSubject: null, passwordHash: 'x', mustChangePassword: false, nameLocked: false, active: true, createdAt: NOW, lastLoginAt: null });
    const sessions = createSessionAuth(store, { secure: false, now: () => clock.now });
    const service = await WorkspaceService.open(new MemoryCommandStore());
    app = await buildApp({
      service, authenticate: sessions.authenticate, recheck: sessions.check, publicOrigin: PUBLIC, heartbeatMs: 30,
      authRoutes: (a) => registerAuthRoutes(a, { store, sessions, config, oidc: null, throttle: new LoginThrottle(), now: () => new Date() }),
    });
    // The cookie is minted through the real session code; the stream is read over a real socket.
    await app.listen({ port: 0, host: '127.0.0.1' });
    const address = app.server.address();
    if (address === null || typeof address === 'string') throw new Error('no port');
    let token = '';
    const reply = { setCookie: (_name: string, value: string) => (token = value) } as never;
    await sessions.startSession(reply, (await store.findUserById('u1'))!);
    return { store, tokenHash: hashToken(token), base: `http://127.0.0.1:${address.port}`, cookie: `${SESSION_COOKIE}=${token}`, logout: () => app!.inject({ method: 'POST', url: '/auth/logout', headers: { 'x-glasshouse': '1', origin: PUBLIC, cookie: `${SESSION_COOKIE}=${token}` } }) };
  }

  /** Resolves true when the server closes the stream, false if it is still open after `ms`. */
  async function endsWithin(res: Response, ms: number): Promise<boolean> {
    const reader = res.body!.getReader();
    const deadline = Date.now() + ms;
    while (Date.now() < deadline) {
      const next = await Promise.race([reader.read(), new Promise<'wait'>((r) => setTimeout(() => r('wait'), deadline - Date.now()))]);
      if (next !== 'wait' && next.done) return true;
    }
    return false;
  }

  it('keeps streaming while the session is good', async () => {
    const { base, cookie } = await signedIn();
    const res = await fetch(`${base}/api/events?after=0`, { headers: { cookie } });
    expect(res.status).toBe(200);
    expect(await endsWithin(res, 300)).toBe(false);
  });

  it('ends within a couple of heartbeats once the user is switched off', async () => {
    const { base, cookie, store } = await signedIn();
    const res = await fetch(`${base}/api/events?after=0`, { headers: { cookie } });
    expect(res.status).toBe(200);
    await store.updateUser('u1', { active: false });
    expect(await endsWithin(res, 1000)).toBe(true);
  });

  it('ends once the person signs out', async () => {
    const { base, cookie, logout } = await signedIn();
    const res = await fetch(`${base}/api/events?after=0`, { headers: { cookie } });
    expect(res.status).toBe(200);
    expect((await logout()).statusCode).toBeLessThan(300);
    expect(await endsWithin(res, 1000)).toBe(true);
  });

  it('ends when the user must now change their password', async () => {
    const { base, cookie, store } = await signedIn();
    const res = await fetch(`${base}/api/events?after=0`, { headers: { cookie } });
    await store.updateUser('u1', { mustChangePassword: true });
    expect(await endsWithin(res, 1000)).toBe(true);
  });

  it('does not count an open tab as activity: heartbeats leave lastSeenAt alone, and the session still lapses after 12 idle hours', async () => {
    const clock = { now: new Date(NOW) };
    const { base, cookie, store, tokenHash } = await signedIn(clock);
    const before = (await store.findSession(tokenHash))!.lastSeenAt;
    const res = await fetch(`${base}/api/events?after=0`, { headers: { cookie } });
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let pings = 0;
    while (pings < 5) {
      const { value, done } = await reader.read();
      if (done) throw new Error('the stream ended while the session was still good');
      const seen = (decoder.decode(value, { stream: true }).match(/event: ping/g) ?? []).length;
      for (let i = 0; i < seen; i += 1) clock.now = new Date(clock.now.getTime() + 6 * 60 * 1000);
      pings += seen;
    }
    expect((await store.findSession(tokenHash))!.lastSeenAt).toBe(before);
    clock.now = new Date(clock.now.getTime() + SESSION_IDLE_MS);
    const ended = await (async () => {
      const deadline = Date.now() + 1000;
      while (Date.now() < deadline) {
        const next = await Promise.race([reader.read(), new Promise<'wait'>((r) => setTimeout(() => r('wait'), deadline - Date.now()))]);
        if (next !== 'wait' && next.done) return true;
      }
      return false;
    })();
    expect(ended).toBe(true);
  });
});

it('opens every stream with a hello frame carrying the server generation, before the backlog', async () => {
  const service = await WorkspaceService.open(new MemoryCommandStore());
  await service.submit(create(1), actor);
  const base = await start(service);
  const text = await readEvents(`${base}/api/events?after=0`, (t) => t.includes('id: 1'));
  expect(text.startsWith(`event: hello\ndata: ${JSON.stringify({ generation: service.generation })}\n\n`)).toBe(true);
  expect(text.indexOf('event: hello')).toBeLessThan(text.indexOf('event: command'));
});

it('gives each server process its own generation', async () => {
  const store = new MemoryCommandStore();
  const first = await WorkspaceService.open(store);
  const second = await WorkspaceService.open(store);
  expect(first.generation).toMatch(/^[0-9a-f-]{36}$/);
  expect(second.generation).not.toBe(first.generation);
});

it('says who made a room change, when someone signed in made it', async () => {
  const ada = { id: 'u-ada', name: 'Ada', role: 'admin' as const, verified: true };
  const service = await WorkspaceService.open(new MemoryCommandStore());
  await service.submit({ clientId: 'a', commandId: '1', command: { type: 'project/create', id: 'p', name: 'P' } }, ada);
  await service.submit({ clientId: 'a', commandId: '2', command: { type: 'site/create', projectId: 'p', id: 's', name: 'S' } }, ada);
  await service.submit({ clientId: 'a', commandId: '3', command: { type: 'room/create', siteId: 's', id: 'r', floorAreaId: 'f', name: 'MDF' } }, ada);
  await service.submit({ clientId: 'a', commandId: '4', command: { type: 'room/rename', roomId: 'r', name: 'MDF-1' } }, actor);
  const base = await start(service);
  const text = await readEvents(`${base}/api/events?after=0`, (t) => t.includes('id: 4'));
  const frames = [...text.matchAll(/event: command\ndata: (.*)\n/g)].map((m) => JSON.parse(m[1]!) as { seq: number; edit?: { roomId: string; name: string; at: string } });
  expect(frames.map((f) => [f.seq, f.edit?.name ?? null])).toEqual([[1, null], [2, null], [3, 'Ada'], [4, null]]);
  expect(frames[2]!.edit).toMatchObject({ roomId: 'r', userId: 'u-ada', at: expect.stringMatching(/^\d{4}-/) });
});
