import { createWorkspace } from '@glasshouse/domain';
import { beforeEach, expect, it, vi } from 'vitest';
import { resetWorkspaceStore, useWorkspaceStore } from '../store/workspaceStore';
import type { EventHandlers, Transport } from './syncClient';
import { startServerSync } from './serverMode';

beforeEach(() => resetWorkspaceStore());

const transport = (overrides: Partial<Transport> = {}): Transport => ({
  fetchWorkspace: vi.fn(async () => ({ seq: 0, workspace: createWorkspace() })),
  postCommands: vi.fn<Transport['postCommands']>(async (_c, commands) => ({ accepted: commands.map((c, i) => ({ commandId: c.commandId, seq: i + 1 })), rejected: null, skipped: [] })),
  openEvents: vi.fn((_after: number, h: EventHandlers) => {
    h.onOpen();
    return () => {};
  }),
  ...overrides,
});

it('loads the workspace from the server and sends edits there', async () => {
  const t = transport();
  const stop = await startServerSync(t);
  const s = useWorkspaceStore.getState();
  expect(s.load.kind).toBe('ready');
  expect(s.connection).toBe('live');
  expect(s.dispatch({ type: 'project/create', id: 'p', name: 'Riverside' })).toBeNull();
  await vi.waitFor(() => expect(t.postCommands).toHaveBeenCalled());
  stop();
});

it('says the server is unreachable instead of opening an empty workspace', async () => {
  await startServerSync(transport({ fetchWorkspace: vi.fn(async () => Promise.reject(new Error('ECONNREFUSED'))) }));
  expect(useWorkspaceStore.getState().load).toMatchObject({ kind: 'failed', reason: expect.stringContaining('ECONNREFUSED') });
});

it('goes read-only when the stream stays down, and back when it returns', async () => {
  vi.useFakeTimers();
  let handlers: EventHandlers | null = null;
  const stop = await startServerSync(transport({ openEvents: vi.fn((_a: number, h: EventHandlers) => ((handlers = h), h.onOpen(), () => {})) }));
  handlers!.onError(false);
  expect(useWorkspaceStore.getState().readOnly).toBe(false);
  await vi.advanceTimersByTimeAsync(3100);
  expect(useWorkspaceStore.getState()).toMatchObject({ readOnly: true, connection: 'offline' });
  handlers!.onOpen();
  expect(useWorkspaceStore.getState()).toMatchObject({ readOnly: false, connection: 'live' });
  stop();
  vi.useRealTimers();
});

it('a cancelled start never wires the store, even when its fetch resolves last', async () => {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const first = transport({ fetchWorkspace: vi.fn(async () => (await gate, { seq: 0, workspace: createWorkspace() })) });
  const second = transport();
  let cancelled = false;
  const p1 = startServerSync(first, () => cancelled);
  cancelled = true;
  const stop2 = await startServerSync(second);
  release();
  (await p1)();
  useWorkspaceStore.getState().dispatch({ type: 'project/create', id: 'p', name: 'Riverside' });
  await vi.waitFor(() => expect(second.postCommands).toHaveBeenCalled());
  expect(first.postCommands).not.toHaveBeenCalled();
  stop2();
});

it('after stop, edits apply locally again', async () => {
  const t = transport();
  const stop = await startServerSync(t);
  stop();
  expect(useWorkspaceStore.getState().connection).toBe('local');
  expect(useWorkspaceStore.getState().dispatch({ type: 'project/create', id: 'q', name: 'Local' })).toBeNull();
  expect(useWorkspaceStore.getState().workspace.projects.some((p) => p.id === 'q')).toBe(true);
  await new Promise((r) => setTimeout(r, 50));
  expect(t.postCommands).not.toHaveBeenCalled();
});
