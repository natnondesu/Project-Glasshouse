import { createWorkspace } from '@glasshouse/domain';
import { beforeEach, expect, it, vi } from 'vitest';
import { resetWorkspaceStore, useWorkspaceStore } from '../store/workspaceStore';
import type { EventHandlers, Transport } from './syncClient';
import { AuthError } from '../auth/authApi';
import { resetAuthStore, useAuthStore } from '../auth/authStore';
import { saveStash, takeStash } from './pendingStash';
import { startServerSync } from './serverMode';

beforeEach(() => {
  resetWorkspaceStore();
  resetAuthStore();
  sessionStorage.clear();
});

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

it('keeps a viewer read-only, with its own reason, through an outage and back', async () => {
  vi.useFakeTimers();
  let handlers: EventHandlers | null = null;
  const viewer = { id: 'v1', name: 'Vi', email: 'v@x', role: 'viewer' as const, mustChangePassword: false };
  const stop = await startServerSync(transport({ openEvents: vi.fn((_a: number, h: EventHandlers) => ((handlers = h), h.onOpen(), () => {})) }), () => false, viewer);
  expect(useWorkspaceStore.getState()).toMatchObject({ readOnly: true, readOnlyReason: 'view-only' });
  handlers!.onError(false);
  await vi.advanceTimersByTimeAsync(3100);
  expect(useWorkspaceStore.getState()).toMatchObject({ readOnly: true, readOnlyReason: 'offline' });
  handlers!.onOpen();
  expect(useWorkspaceStore.getState()).toMatchObject({ readOnly: true, readOnlyReason: 'view-only', connection: 'live' });
  stop();
  expect(useWorkspaceStore.getState()).toMatchObject({ readOnly: false, readOnlyReason: null });
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
  await Promise.resolve();
  expect(t.postCommands).not.toHaveBeenCalled();
});

it('after stop while offline, edits apply locally', async () => {
  vi.useFakeTimers();
  let handlers: EventHandlers | null = null;
  const stop = await startServerSync(transport({ openEvents: vi.fn((_a: number, h: EventHandlers) => ((handlers = h), h.onOpen(), () => {})) }));
  handlers!.onError(false);
  await vi.advanceTimersByTimeAsync(3100);
  expect(useWorkspaceStore.getState().readOnly).toBe(true);
  stop();
  expect(useWorkspaceStore.getState().dispatch({ type: 'project/create', id: 'q', name: 'Local' })).toBeNull();
  expect(useWorkspaceStore.getState().workspace.projects.some((p) => p.id === 'q')).toBe(true);
  vi.useRealTimers();
});

it('keeps unsent edits across a sign-in: sends them first, with the old tab id, then loads', async () => {
  saveStash({ userId: 'u1', clientId: 'old-tab', commands: [{ commandId: 'c9', command: { type: 'project/create', id: 'p', name: 'Kept' } }] });
  const order: string[] = [];
  const t = transport({
    postCommands: vi.fn<Transport['postCommands']>(async (clientId, commands) => { order.push(`post:${clientId}:${commands.map((c) => c.commandId).join(',')}`); return { accepted: commands.map((c, i) => ({ commandId: c.commandId, seq: i + 1 })), rejected: null, skipped: [] }; }),
    fetchWorkspace: vi.fn(async () => { order.push('fetch'); return { seq: 1, workspace: createWorkspace() }; }),
  });
  const stop = await startServerSync(t, () => false, { id: 'u1', name: 'Ploy', email: 'p@x', role: 'editor', mustChangePassword: false });
  expect(order.slice(0, 2)).toEqual(['post:old-tab:c9', 'fetch']);
  stop();
});

const me = { id: 'u1', name: 'Ploy', email: 'p@x', role: 'editor' as const, mustChangePassword: false };
const kept = [{ commandId: 'c1', command: { type: 'project/create' as const, id: 'p', name: 'A' } }, { commandId: 'c2', command: { type: 'project/create' as const, id: 'q', name: 'B' } }];

it('goes to sign-in, not a dead-end error, when the first load says the session is gone', async () => {
  useAuthStore.setState({ status: 'signed-in' });
  await startServerSync(transport({ fetchWorkspace: vi.fn(async () => Promise.reject(new AuthError('unauthorised', 'gone'))) }), () => false, me);
  expect(useAuthStore.getState()).toMatchObject({ status: 'signed-out', sessionEnded: true });
  expect(useWorkspaceStore.getState().load.kind).toBe('loading');
});

it('keeps the stash and goes to sign-in when sending it hits an ended session', async () => {
  useAuthStore.setState({ status: 'signed-in' });
  saveStash({ userId: 'u1', clientId: 'old-tab', commands: kept });
  const t = transport({ postCommands: vi.fn(async () => Promise.reject(new AuthError('unauthorised', 'gone'))) });
  await startServerSync(t, () => false, me);
  expect(useAuthStore.getState().status).toBe('signed-out');
  expect(useWorkspaceStore.getState().notice).toBeNull();
  expect(takeStash('u1')).toEqual({ clientId: 'old-tab', commands: kept });
  expect(t.fetchWorkspace).not.toHaveBeenCalled();
});

it('keeps the edits the server skipped, and says how many', async () => {
  saveStash({ userId: 'u1', clientId: 'old-tab', commands: kept });
  const t = transport({
    postCommands: vi.fn<Transport['postCommands']>(async () => ({ accepted: [], rejected: { commandId: 'c1', error: { code: 'invalid_value', message: 'Name is taken.', targets: [] } }, skipped: ['c2'] })),
  });
  const stop = await startServerSync(t, () => false, me);
  expect(useWorkspaceStore.getState().notice).toContain('Name is taken.');
  expect(useWorkspaceStore.getState().notice).toContain('1 change from before you signed in');
  expect(takeStash('u1')).toEqual({ clientId: 'old-tab', commands: [kept[1]] });
  stop();
});
