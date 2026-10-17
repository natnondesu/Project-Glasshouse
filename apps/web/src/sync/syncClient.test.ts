import { apply, createWorkspace, currentRevision, findRoom, type Workspace, type WorkspaceCommand } from '@glasshouse/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthError } from '../auth/authApi';
import type { Claim } from '../claims/claimsStore';
import { NetworkError, SyncClient, WATCHDOG_MS, type BatchOutcome, type EventHandlers, type Transport } from './syncClient';

const RETRY_MIN_MS = 500;
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

const callbacks = () => ({ onWorkspace: vi.fn<(ws: Workspace) => void>(), onSave: vi.fn(), onConnection: vi.fn(), onDropped: vi.fn(), onUnsaved: vi.fn<(has: boolean) => void>(), onAuthLost: vi.fn(), onClaims: vi.fn<(claims: Claim[]) => void>(), onClaimLost: vi.fn<(lost: { roomId: string; workspace: Workspace; changes: number }) => void>() });

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
    await vi.advanceTimersByTimeAsync(5_000);
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
    await vi.advanceTimersByTimeAsync(5_000);
    expect(server.transport.fetchWorkspace).toHaveBeenCalled();
    expect(server.transport.openEvents).toHaveBeenCalledTimes(2);
  });
  describe('server generation', () => {
    const handlersOf = (server: ReturnType<typeof fakeServer>, n = 0) => (server.transport.openEvents as ReturnType<typeof vi.fn>).mock.calls[n]![1] as EventHandlers;

    it('does nothing when hello carries the generation the snapshot had', async () => {
      const server = fakeServer();
      const client = new SyncClient(server.transport, { seq: 0, workspace: createWorkspace(), generation: 'g1' }, callbacks(), { clientId: 'me' });
      client.start();
      handlersOf(server).onHello('g1');
      await vi.advanceTimersByTimeAsync(5_000);
      expect(server.transport.fetchWorkspace).not.toHaveBeenCalled();
    });

    it('reloads the workspace, replaying unsent edits, when hello carries a different generation', async () => {
      const server = fakeServer();
      const cb = callbacks();
      let n = 0;
      const client = new SyncClient(server.transport, { seq: 0, workspace: createWorkspace(), generation: 'g1' }, cb, { clientId: 'me', newId: () => String(++n) });
      client.start();
      (server.transport.fetchWorkspace as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ seq: 0, workspace: createWorkspace(), generation: 'g2' });
      server.failOnce();
      client.dispatch(create('p', 'Riverside'));
      handlersOf(server).onHello('g2');
      await vi.advanceTimersByTimeAsync(20_000);
      expect(server.transport.fetchWorkspace).toHaveBeenCalledTimes(1);
      expect(server.transport.openEvents).toHaveBeenCalledTimes(2);
      // The unsent edit is not lost by the reload: it is sent again (same id) before the snapshot is read.
      expect(server.posts).toEqual([['1'], ['1']]);
      // The reconnected stream says hello with the new generation: no second reload.
      handlersOf(server, 1).onHello('g2');
      await vi.advanceTimersByTimeAsync(5_000);
      expect(server.transport.fetchWorkspace).toHaveBeenCalledTimes(1);
    });
  });

  it('reconnects through a resync when the browser gives up on the stream', async () => {
    const server = fakeServer();
    const client = new SyncClient(server.transport, { seq: 0, workspace: createWorkspace() }, callbacks(), { clientId: 'me' });
    client.start();
    const handlers = (server.transport.openEvents as ReturnType<typeof vi.fn>).mock.calls[0]![1] as EventHandlers;
    handlers.onError(true);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(server.transport.fetchWorkspace).toHaveBeenCalled();
    expect(server.transport.openEvents).toHaveBeenCalledTimes(2);
  });

  it('does not tell the user to reload after repeated lost connections', async () => {
    const server = fakeServer();
    const cb = callbacks();
    const client = new SyncClient(server.transport, { seq: 0, workspace: createWorkspace() }, cb, { clientId: 'me' });
    client.start();
    for (let i = 0; i < 5; i++) {
      const calls = (server.transport.openEvents as ReturnType<typeof vi.fn>).mock.calls;
      (calls[calls.length - 1]![1] as EventHandlers).onError(true);
      await vi.advanceTimersByTimeAsync(20_000);
    }
    await vi.advanceTimersByTimeAsync(WATCHDOG_MS + 20_000);
    await vi.advanceTimersByTimeAsync(WATCHDOG_MS + 20_000);
    expect((server.transport.openEvents as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(6);
    expect(cb.onSave).not.toHaveBeenCalledWith(expect.objectContaining({ reason: expect.stringContaining('out of step') }));
    client.stop();
  });

  it('does not tell the user to reload after repeated server-requested resyncs', async () => {
    const server = fakeServer();
    const cb = callbacks();
    const client = new SyncClient(server.transport, { seq: 0, workspace: createWorkspace() }, cb, { clientId: 'me' });
    client.start();
    for (let i = 0; i < 4; i++) {
      const calls = (server.transport.openEvents as ReturnType<typeof vi.fn>).mock.calls;
      (calls[calls.length - 1]![1] as EventHandlers).onResync();
      await vi.advanceTimersByTimeAsync(20_000);
    }
    expect(cb.onSave).not.toHaveBeenCalledWith(expect.objectContaining({ reason: expect.stringContaining('out of step') }));
    client.stop();
  });

  it('reports unsaved edits until the server has ordered them', async () => {
    const server = fakeServer();
    const cb = callbacks();
    const client = new SyncClient(server.transport, { seq: 0, workspace: createWorkspace() }, cb, { clientId: 'me' });
    client.start();
    client.dispatch(create('p'));
    await vi.advanceTimersByTimeAsync(100);
    expect(cb.onUnsaved.mock.calls.map((c) => c[0])).toEqual([true, false]);
    client.stop();
  });

  it('backs off and tells the user when every event fails to apply', async () => {
    const server = fakeServer();
    let n = 0;
    (server.transport.openEvents as ReturnType<typeof vi.fn>).mockImplementation((after: number, h: EventHandlers) => {
      n += 1;
      h.onOpen();
      h.onCommand({ seq: after + 1, clientId: 'o', commandId: `e${n}`, command: { type: 'site/create', projectId: 'nope', id: 's', name: 'S' } as WorkspaceCommand });
      return () => {};
    });
    const cb = callbacks();
    const client = new SyncClient(server.transport, { seq: 0, workspace: createWorkspace() }, cb, { clientId: 'me' });
    client.start();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(cb.onSave).toHaveBeenCalledWith({ kind: 'failed', reason: 'This page is out of step with the server. Reload to continue.' });
    expect(n).toBeGreaterThanOrEqual(4);
    expect(n).toBeLessThan(15);
    client.stop();
  });

  it('holds edits back while the snapshot loads, so none is applied twice', async () => {
    const server = fakeServer();
    let release!: (v: { seq: number; workspace: unknown }) => void;
    (server.transport.fetchWorkspace as ReturnType<typeof vi.fn>).mockImplementationOnce(
      () => new Promise((resolve) => (release = resolve)),
    );
    const cb = callbacks();
    let n = 0;
    const client = new SyncClient(server.transport, { seq: 0, workspace: createWorkspace() }, cb, { clientId: 'me', newId: () => String(++n) });
    client.start();
    const handlers = (server.transport.openEvents as ReturnType<typeof vi.fn>).mock.calls[0]![1] as EventHandlers;
    handlers.onResync();
    await vi.advanceTimersByTimeAsync(0);
    client.dispatch(create('p', 'Riverside'));
    await vi.advanceTimersByTimeAsync(0);
    expect(server.transport.postCommands).not.toHaveBeenCalled();
    release({ seq: 0, workspace: createWorkspace() });
    await vi.advanceTimersByTimeAsync(0);
    await client.flush();
    expect(server.posts).toEqual([['1']]);
    expect(cb.onDropped).not.toHaveBeenCalled();
    expect(client.workspace.projects.map((p) => p.name)).toEqual(['Riverside']);
  });

  describe('watchdog', () => {
    const setup = () => {
      const server = fakeServer();
      const client = new SyncClient(server.transport, { seq: 0, workspace: createWorkspace() }, callbacks(), { clientId: 'me' });
      client.start();
      const handlers = (server.transport.openEvents as ReturnType<typeof vi.fn>).mock.calls[0]![1] as EventHandlers;
      return { server, client, handlers };
    };

    it('treats a stream that goes silent for WATCHDOG_MS as closed and resyncs', async () => {
      const { server } = setup();
      await vi.advanceTimersByTimeAsync(WATCHDOG_MS + 1);
      await vi.advanceTimersByTimeAsync(RETRY_MIN_MS + 1);
      expect(server.transport.fetchWorkspace).toHaveBeenCalled();
      expect(server.transport.openEvents).toHaveBeenCalledTimes(2);
    });

    it('stays connected while heartbeats keep arriving', async () => {
      const { server, handlers } = setup();
      for (let t = 0; t < 60_000; t += 15_000) {
        await vi.advanceTimersByTimeAsync(15_000);
        handlers.onHeartbeat();
      }
      expect(server.transport.fetchWorkspace).not.toHaveBeenCalled();
      expect(server.transport.openEvents).toHaveBeenCalledTimes(1);
    });

    it('reports offline when the watchdog fires', async () => {
      const server = fakeServer();
      const cb = callbacks();
      new SyncClient(server.transport, { seq: 0, workspace: createWorkspace() }, cb, { clientId: 'me' }).start();
      await vi.advanceTimersByTimeAsync(WATCHDOG_MS + 1);
      expect(cb.onConnection).toHaveBeenCalledWith('offline');
    });

    it('stop() clears the watchdog', async () => {
      const { server, client } = setup();
      client.stop();
      await vi.advanceTimersByTimeAsync(WATCHDOG_MS * 2);
      expect(server.transport.fetchWorkspace).not.toHaveBeenCalled();
      expect(server.transport.openEvents).toHaveBeenCalledTimes(1);
    });
  });
  it('stops and reports when the session ends, keeping the unsent edit', async () => {
    const server = fakeServer();
    (server.transport.postCommands as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new AuthError('unauthorised', 'Sign in to use Glasshouse.'));
    const cb = { ...callbacks(), onAuthLost: vi.fn() };
    const client = new SyncClient(server.transport, { seq: 0, workspace: createWorkspace() }, cb, { clientId: 'me', newId: () => '1' });
    client.start();
    client.dispatch(create('p', 'Riverside'));
    await client.flush();
    expect(cb.onAuthLost).toHaveBeenCalledTimes(1);
    // The rejected call replaces the fake's own implementation, so count calls rather than `posts`.
    expect(server.transport.postCommands).toHaveBeenCalledTimes(1);
    expect(client.pendingCommands().map((c) => c.commandId)).toEqual(['1']);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(server.transport.postCommands).toHaveBeenCalledTimes(1);
    expect(server.posts).toEqual([]);
  });

  describe('claims', () => {
    const wsWithRooms = (ids: string[]): Workspace =>
      ([
        { type: 'project/create', id: 'p', name: 'P' },
        { type: 'site/create', projectId: 'p', id: 's', name: 'S' },
        ...ids.map((id): WorkspaceCommand => ({ type: 'room/create', siteId: 's', id, floorAreaId: `fa-${id}`, name: id })),
      ] as WorkspaceCommand[]).reduce((ws, c) => {
        const r = apply(ws, c);
        if (!r.ok) throw new Error(r.error.message);
        return r.value;
      }, createWorkspace());
    const vlanAdd = (roomId: string, vid: number): WorkspaceCommand => ({ type: 'plan', roomId, command: { type: 'vlan/add', vlan: { vid, name: `V${vid}` } } });
    const vlansOf = (ws: Workspace, roomId: string): number[] => currentRevision(findRoom(ws, roomId)!.room.plan).content.vlans.map((v) => v.vid);
    const claim: Claim = { roomId: 'r', userId: 'u', name: 'Ada', since: 't', lastEditAt: 't' };

    it('keeps this tab version when a room is claimed by someone else, drops its edits, and sends the rest', async () => {
      const server = fakeServer();
      (server.transport.postCommands as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        accepted: [],
        rejected: { commandId: '1', error: { code: 'claimed', message: 'Ada is editing this room, so your change was not saved.', targets: ['r'] } },
        skipped: ['2'],
      });
      const cb = callbacks();
      let n = 0;
      const client = new SyncClient(server.transport, { seq: 0, workspace: wsWithRooms(['r', 'q']) }, cb, { clientId: 'me', newId: () => String(++n) });
      client.start();
      client.dispatch(vlanAdd('r', 10));
      client.dispatch(vlanAdd('r', 12));
      client.dispatch(vlanAdd('q', 11));
      await client.flush();
      expect(cb.onClaimLost).toHaveBeenCalledTimes(1);
      const lost = cb.onClaimLost.mock.calls[0]![0];
      expect(lost).toMatchObject({ roomId: 'r', changes: 2 });
      expect(vlansOf(lost.workspace, 'r')).toEqual([10, 12]);
      expect(cb.onDropped).not.toHaveBeenCalled();
      const sent = (server.transport.postCommands as ReturnType<typeof vi.fn>).mock.calls.map((c) => (c[1] as { commandId: string }[]).map((x) => x.commandId));
      expect(sent).toEqual([['1'], ['3']]);
      expect(vlansOf(client.workspace, 'r')).toEqual([]);
      expect(vlansOf(client.workspace, 'q')).toEqual([11]);
    });

    it('passes claims from the event stream and from a resync snapshot to onClaims', async () => {
      const server = fakeServer();
      const cb = callbacks();
      const client = new SyncClient(server.transport, { seq: 0, workspace: createWorkspace() }, cb, { clientId: 'me' });
      client.start();
      const handlers = (server.transport.openEvents as ReturnType<typeof vi.fn>).mock.calls[0]![1] as EventHandlers;
      handlers.onClaims([claim]);
      expect(cb.onClaims).toHaveBeenLastCalledWith([claim]);
      (server.transport.fetchWorkspace as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ seq: 0, workspace: createWorkspace(), claims: [claim] });
      handlers.onResync();
      await vi.advanceTimersByTimeAsync(5_000);
      expect(cb.onClaims).toHaveBeenLastCalledWith([claim]);
      expect(cb.onClaims).toHaveBeenCalledTimes(2);
    });
  });
});
