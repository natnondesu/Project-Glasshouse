import { createWorkspace, type Workspace, type WorkspaceCommand } from '@glasshouse/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NetworkError, SyncClient, type BatchOutcome, type EventHandlers, type Transport } from './syncClient';

const create = (id: string, name = id): WorkspaceCommand => ({ type: 'project/create', id, name });

/** A fake server: orders commands, remembers IDs (idempotent), pushes events to the open stream. */
function fakeServer() {
  let seq = 0;
  const seen = new Map<string, number>();
  let handlers: EventHandlers | null = null;
  const posts: string[][] = [];
  let failNext = 0;
  const transport: Transport = {
    fetchWorkspace: vi.fn(async () => ({ seq, workspace: createWorkspace() })),
    postCommands: vi.fn(async (clientId: string, commands: Parameters<Transport['postCommands']>[1]): Promise<BatchOutcome> => {
      posts.push(commands.map((c) => c.commandId));
      if (failNext > 0) {
        failNext -= 1;
        throw new NetworkError('server down');
      }
      const accepted = commands.map((c) => {
        const key = `${clientId}/${c.commandId}`;
        if (!seen.has(key)) {
          seq += 1;
          seen.set(key, seq);
          handlers?.onCommand({ seq, clientId, commandId: c.commandId, command: c.command });
        }
        return { commandId: c.commandId, seq: seen.get(key)! };
      });
      return { accepted, rejected: null, skipped: [] };
    }),
    openEvents: vi.fn((_after, h) => {
      handlers = h;
      h.onOpen();
      return () => {
        handlers = null;
      };
    }),
  };
  return { transport, posts, failOnce: () => void (failNext = 1), get seq() { return seq; } };
}

const callbacks = () => ({ onWorkspace: vi.fn<(ws: Workspace) => void>(), onSave: vi.fn(), onConnection: vi.fn(), onDropped: vi.fn() });

describe('SyncClient', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('sends an edit, then reports saved', async () => {
    const server = fakeServer();
    const cb = callbacks();
    let n = 0;
    const client = new SyncClient(server.transport, { seq: 0, workspace: createWorkspace() }, cb, { clientId: 'me', newId: () => String(++n) });
    client.start();
    expect(client.dispatch(create('p', 'Riverside')).ok).toBe(true);
    await client.flush();
    expect(server.posts).toEqual([['1']]);
    expect(cb.onSave).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'saved' }));
    expect(cb.onConnection).toHaveBeenCalledWith('live');
  });

  it('retries after a network failure without applying twice', async () => {
    const server = fakeServer();
    const cb = callbacks();
    let n = 0;
    const client = new SyncClient(server.transport, { seq: 0, workspace: createWorkspace() }, cb, { clientId: 'me', newId: () => String(++n) });
    client.start();
    server.failOnce();
    client.dispatch(create('p', 'Riverside'));
    const done = client.flush();
    await vi.runAllTimersAsync();
    await done;
    expect(server.posts).toEqual([['1'], ['1']]);
    expect(server.seq).toBe(1);
    expect(cb.onSave).toHaveBeenCalledWith(expect.objectContaining({ kind: 'failed' }));
    expect(cb.onSave).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'saved' }));
    expect(client.workspace.projects.map((p) => p.name)).toEqual(['Riverside']);
  });

  it('shows a rejected edit as dropped with the server reason', async () => {
    const server = fakeServer();
    (server.transport.postCommands as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      accepted: [], rejected: { commandId: '1', error: { code: 'stale', message: 'Room changed', targets: [] } }, skipped: [],
    });
    const cb = callbacks();
    const client = new SyncClient(server.transport, { seq: 0, workspace: createWorkspace() }, cb, { clientId: 'me', newId: () => '1' });
    client.start();
    client.dispatch(create('p'));
    await client.flush();
    expect(cb.onDropped).toHaveBeenCalledWith([{ commandId: '1', error: expect.objectContaining({ message: 'Room changed' }) }]);
    expect(client.workspace.projects).toEqual([]);
  });

  it('reloads the workspace when the stream says resync', async () => {
    const server = fakeServer();
    const cb = callbacks();
    const client = new SyncClient(server.transport, { seq: 0, workspace: createWorkspace() }, cb, { clientId: 'me' });
    client.start();
    const handlers = (server.transport.openEvents as ReturnType<typeof vi.fn>).mock.calls[0]![1] as EventHandlers;
    handlers.onResync();
    await vi.runAllTimersAsync();
    expect(server.transport.fetchWorkspace).toHaveBeenCalled();
    expect(server.transport.openEvents).toHaveBeenCalledTimes(2);
  });
});
