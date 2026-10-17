import { createWorkspace } from '@glasshouse/domain';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { httpTransport } from './httpTransport';
import { NetworkError, SyncClient } from './syncClient';

afterEach(() => vi.unstubAllGlobals());

describe('httpTransport timeouts', () => {
  it('gives every request an abort signal', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ seq: 0, workspace: {} }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const t = httpTransport();
    await t.fetchWorkspace();
    await t.postCommands('c', [{ commandId: '1', command: { type: 'backup/mark', at: 'x' } }]);
    for (const call of fetchMock.mock.calls as unknown as [string, RequestInit][]) expect(call[1].signal).toBeInstanceOf(AbortSignal);
  });

  it('treats a timed-out request as a network error, so the batch is retried', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new DOMException('timed out', 'TimeoutError'))));
    const t = httpTransport();
    await expect(t.fetchWorkspace()).rejects.toBeInstanceOf(NetworkError);
    await expect(t.postCommands('c', [{ commandId: '1', command: { type: 'backup/mark', at: 'x' } }])).rejects.toBeInstanceOf(NetworkError);
  });
});

describe('httpTransport proxy errors never drop edits', () => {
  const batch = [
    { commandId: '1', command: { type: 'backup/mark', at: 'x' } as const },
    { commandId: '2', command: { type: 'backup/mark', at: 'y' } as const },
  ];
  const answer = (body: string, status: number, contentType = 'text/plain') => vi.stubGlobal('fetch', vi.fn(async () => new Response(body, { status, headers: { 'content-type': contentType } })));

  it('retries when a proxy answers a plain-text 404 (container starting or unhealthy)', async () => {
    answer('404 page not found', 404);
    await expect(httpTransport().postCommands('c', batch)).rejects.toBeInstanceOf(NetworkError);
  });

  it.each([408, 429, 502, 503, 504])('retries on status %i', async (status) => {
    answer(JSON.stringify({ error: { code: 'x', message: 'm', targets: [] } }), status, 'application/json');
    await expect(httpTransport().postCommands('c', batch)).rejects.toBeInstanceOf(NetworkError);
  });

  it('retries when a non-ok body is not parseable', async () => {
    answer('<html>oops</html>', 400, 'text/html');
    await expect(httpTransport().postCommands('c', batch)).rejects.toBeInstanceOf(NetworkError);
  });

  it('retries when the JSON body has no string error code', async () => {
    answer(JSON.stringify({ error: { message: 'm' } }), 400, 'application/json');
    await expect(httpTransport().postCommands('c', batch)).rejects.toBeInstanceOf(NetworkError);
  });

  it("treats the server's JSON error envelope on a 4xx as a refusal of the first command", async () => {
    answer(JSON.stringify({ error: { code: 'invalid_value', message: 'Too big', targets: [] } }), 400, 'application/json');
    const out = await httpTransport().postCommands('c', batch);
    expect(out.accepted).toEqual([]);
    expect(out.rejected).toMatchObject({ commandId: '1', error: { code: 'invalid_value', message: 'Too big' } });
    expect(out.skipped).toEqual(['2']);
  });

  it('retries a workspace load answered with a non-JSON error', async () => {
    answer('404 page not found', 404);
    await expect(httpTransport().fetchWorkspace()).rejects.toBeInstanceOf(NetworkError);
  });

  it('keeps the edit pending and drops nothing while a proxy answers 404', async () => {
    vi.useFakeTimers();
    try {
      answer('404 page not found', 404);
      const onDropped = vi.fn();
      const client = new SyncClient(httpTransport(), { seq: 0, workspace: createWorkspace() }, { onWorkspace: vi.fn(), onSave: vi.fn(), onConnection: vi.fn(), onDropped, onUnsaved: vi.fn(), onAuthLost: vi.fn() });
      client.dispatch({ type: 'project/create', id: 'p', name: 'Riverside' });
      await vi.advanceTimersByTimeAsync(2_000);
      expect((fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(1);
      expect(client.pendingCommands()).toHaveLength(1);
      expect(onDropped).not.toHaveBeenCalled();
      client.stop();
    } finally {
      vi.useRealTimers();
    }
  });
});
