import { afterEach, describe, expect, it, vi } from 'vitest';
import { httpTransport } from './httpTransport';
import { NetworkError } from './syncClient';

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
