import { apply, createWorkspace, parseProjectFile, type WorkspaceCommand } from '@glasshouse/domain';
import { afterEach, beforeEach, expect, it, vi, type MockInstance } from 'vitest';
import { resetWorkspaceStore, useWorkspaceStore } from '../store/workspaceStore';
import type { EventHandlers, Transport } from './syncClient';
import { AuthError } from '../auth/authApi';
import { clearClaimsStore, useClaimsStore } from '../claims/claimsStore';
import { resetAuthStore, useAuthStore } from '../auth/authStore';
import { resetPeopleStore, usePeopleStore } from '../people/peopleStore';
import { saveStash, takeStash } from './pendingStash';
import { getActiveSync, startServerSync } from './serverMode';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
let people: { id: string; name: string; email: string }[];
let fetchSpy: MockInstance<typeof fetch>;

beforeEach(() => {
  people = [];
  // The server-only calls a signed-in tab makes: the people list, and "who am I now" (by default, still the same person).
  fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    if (url === '/api/people') return json({ people });
    if (url === '/auth/me') return json(useAuthStore.getState().user);
    return json({}, 404);
  });
  resetWorkspaceStore();
  resetAuthStore();
  resetPeopleStore();
  clearClaimsStore();
  sessionStorage.clear();
});

afterEach(() => vi.restoreAllMocks());

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
  useAuthStore.setState({ status: 'signed-in', user: viewer });
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

it('does not overwrite another person’s unsent edits when the session ends with nothing pending', async () => {
  useAuthStore.setState({ status: 'signed-in' });
  saveStash({ userId: 'u2', clientId: 'their-tab', commands: kept });
  let handlers: EventHandlers | null = null;
  const fetchWorkspace = vi.fn<Transport['fetchWorkspace']>(async () => ({ seq: 0, workspace: createWorkspace() }));
  await startServerSync(transport({ fetchWorkspace, openEvents: vi.fn((_a: number, h: EventHandlers) => ((handlers = h), h.onOpen(), () => {})) }), () => false, me);
  fetchWorkspace.mockRejectedValueOnce(new AuthError('unauthorised', 'gone'));
  handlers!.onResync();
  await vi.waitFor(() => expect(useAuthStore.getState().status).toBe('signed-out'));
  expect(takeStash('u2')).toEqual({ clientId: 'their-tab', commands: kept });
});

it('keeps this person’s pending edits when the session ends', async () => {
  useAuthStore.setState({ status: 'signed-in' });
  const t = transport({ postCommands: vi.fn(async () => Promise.reject(new AuthError('unauthorised', 'gone'))) });
  await startServerSync(t, () => false, me);
  useWorkspaceStore.getState().dispatch({ type: 'project/create', id: 'p', name: 'Mine' });
  await vi.waitFor(() => expect(useAuthStore.getState().status).toBe('signed-out'));
  expect(takeStash('u1')?.commands).toHaveLength(1);
});

const claimFor = (roomId: string) => ({ roomId, userId: 'u-ada', name: 'Ada', since: 't', lastEditAt: 't' });

it('keeps who is editing from the first snapshot and from the stream, and clears it on stop', async () => {
  let handlers: EventHandlers | null = null;
  const stop = await startServerSync(
    transport({
      fetchWorkspace: vi.fn(async () => ({ seq: 0, workspace: createWorkspace(), claims: [claimFor('r')] })),
      openEvents: vi.fn((_a: number, h: EventHandlers) => ((handlers = h), h.onOpen(), () => {})),
    }),
  );
  expect(Object.keys(useClaimsStore.getState().byRoom)).toEqual(['r']);
  handlers!.onClaims([claimFor('q')]);
  expect(Object.keys(useClaimsStore.getState().byRoom)).toEqual(['q']);
  stop();
  expect(useClaimsStore.getState().byRoom).toEqual({});
});

it('offers the person their own version when their edits to a room were refused', async () => {
  const setup: WorkspaceCommand[] = [
    { type: 'project/create', id: 'p', name: 'Riverside' },
    { type: 'site/create', projectId: 'p', id: 's', name: 'S' },
    { type: 'room/create', siteId: 's', id: 'r', floorAreaId: 'fa-r', name: 'MDF-1' },
  ];
  const ws = setup.reduce((w, c) => {
    const r = apply(w, c);
    if (!r.ok) throw new Error(r.error.message);
    return r.value;
  }, createWorkspace());
  const t = transport({
    fetchWorkspace: vi.fn(async () => ({ seq: 0, workspace: ws, claims: [claimFor('r')] })),
    postCommands: vi.fn<Transport['postCommands']>(async (_c, commands) => ({
      accepted: [],
      rejected: { commandId: commands[0]!.commandId, error: { code: 'claimed', message: 'Ada is editing this room', targets: ['r'] } },
      skipped: [],
    })),
  });
  const stop = await startServerSync(t);
  // The tab doesn't know yet (it is not signed in here), so the edit goes out and the server refuses it.
  useWorkspaceStore.getState().dispatch({ type: 'plan', roomId: 'r', command: { type: 'survey/update', patch: { width: 9.4 } } });
  await vi.waitFor(() => expect(useClaimsStore.getState().lost).toHaveLength(1));
  const [lost] = useClaimsStore.getState().lost;
  expect(lost).toMatchObject({ roomId: 'r', roomName: 'MDF-1', holderName: 'Ada', changes: 1 });
  expect(lost!.file.format).toBe('glasshouse.project');
  // The file is this tab's version: it holds the edit the server refused.
  const room = lost!.file.project.sites[0]!.rooms[0]!;
  expect(room.plan.revisions.map((r) => r.content.survey.width)).toContain(9.4);
  expect(parseProjectFile(JSON.parse(JSON.stringify(lost!.file))).ok).toBe(true);
  stop();
  // The copy outlives the sync: only who-holds-what is forgotten.
  expect(useClaimsStore.getState().lost).toHaveLength(1);
});

const calls = (url: string): number => fetchSpy.mock.calls.filter(([u]) => String(u) === url).length;
const person = (role: 'viewer' | 'editor') => ({ id: 'u1', name: 'Ploy', email: 'p@x', role, mustChangePassword: false });
const forbidding = (): Partial<Transport> => ({
  postCommands: vi.fn<Transport['postCommands']>(async (_c, commands) => ({
    accepted: [],
    rejected: { commandId: commands[0]!.commandId, error: { code: 'forbidden', message: "Viewers can't edit rooms.", targets: [] } },
    skipped: [],
  })),
});

it('loads the people list once signed in, and again when the stream reconnects', async () => {
  people = [{ id: 'u1', name: 'Ploy Sriwan', email: 'ploy@x.test' }];
  useAuthStore.setState({ status: 'signed-in', user: person('editor') });
  let handlers: EventHandlers | null = null;
  const stop = await startServerSync(transport({ openEvents: vi.fn((_a: number, h: EventHandlers) => ((handlers = h), h.onOpen(), () => {})) }), () => false, person('editor'));
  await vi.waitFor(() => expect(usePeopleStore.getState().byId).toEqual({ u1: { name: 'Ploy Sriwan', email: 'ploy@x.test' } }));
  expect(calls('/api/people')).toBe(1);
  expect(calls('/auth/me')).toBe(0);
  handlers!.onOpen();
  await vi.waitFor(() => expect(calls('/api/people')).toBe(2));
  expect(calls('/auth/me')).toBe(1);
  stop();
  expect(usePeopleStore.getState().byId).toEqual({});
});

it('still opens, and says why names lack emails, when the people list cannot be loaded', async () => {
  fetchSpy.mockImplementation(async () => json({}, 500));
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  useAuthStore.setState({ status: 'signed-in', user: person('editor') });
  const stop = await startServerSync(transport(), () => false, person('editor'));
  expect(useWorkspaceStore.getState().load.kind).toBe('ready');
  await vi.waitFor(() => expect(warn).toHaveBeenCalledWith(expect.stringContaining('people list'), expect.any(Error)));
  stop();
});

it('asks the server who I am now when an edit is refused as forbidden, and goes read-only if demoted', async () => {
  const ws = apply(createWorkspace(), { type: 'project/create', id: 'p', name: 'Riverside' });
  if (!ws.ok) throw new Error(ws.error.message);
  useAuthStore.setState({ status: 'signed-in', user: person('editor') });
  fetchSpy.mockImplementation(async (input) => (String(input) === '/auth/me' ? json(person('viewer')) : json({ people: [] })));
  const stop = await startServerSync(transport(forbidding()), () => false, person('editor'));
  expect(useWorkspaceStore.getState().readOnly).toBe(false);
  useWorkspaceStore.getState().dispatch({ type: 'project/create', id: 'q', name: 'Local' });
  await vi.waitFor(() => expect(useWorkspaceStore.getState()).toMatchObject({ readOnly: true, readOnlyReason: 'view-only' }));
  expect(useAuthStore.getState().user?.role).toBe('viewer');
  expect(useWorkspaceStore.getState().notice).toContain("Viewers can't edit rooms.");
  stop();
});

it('unlocks editing on reconnect when an admin has made a viewer an editor', async () => {
  useAuthStore.setState({ status: 'signed-in', user: person('viewer') });
  fetchSpy.mockImplementation(async (input) => (String(input) === '/auth/me' ? json(person('editor')) : json({ people: [] })));
  let handlers: EventHandlers | null = null;
  const stop = await startServerSync(transport({ openEvents: vi.fn((_a: number, h: EventHandlers) => ((handlers = h), h.onOpen(), () => {})) }), () => false, person('viewer'));
  expect(useWorkspaceStore.getState()).toMatchObject({ readOnly: true, readOnlyReason: 'view-only' });
  handlers!.onOpen();
  await vi.waitFor(() => expect(useWorkspaceStore.getState()).toMatchObject({ readOnly: false, readOnlyReason: null }));
  stop();
});

it('stops watching the role when sync stops', async () => {
  useAuthStore.setState({ status: 'signed-in', user: person('editor') });
  const unsubscribe = vi.fn();
  const real = useAuthStore.subscribe;
  vi.spyOn(useAuthStore, 'subscribe').mockImplementation((listener) => {
    const off = real(listener);
    return () => (unsubscribe(), off());
  });
  const stop = await startServerSync(transport(), () => false, person('editor'));
  expect(unsubscribe).not.toHaveBeenCalled();
  stop();
  expect(unsubscribe).toHaveBeenCalledTimes(1);
});

it('applies a demotion in place: the sync is not restarted and unsent edits stay queued', async () => {
  useAuthStore.setState({ status: 'signed-in', user: person('editor') });
  const t = transport({ postCommands: vi.fn<Transport['postCommands']>(() => new Promise(() => {})) });
  const stop = await startServerSync(t, () => false, person('editor'));
  useWorkspaceStore.getState().dispatch({ type: 'project/create', id: 'q', name: 'Unsent' });
  expect(getActiveSync()!.pendingCommands()).toHaveLength(1);

  useAuthStore.setState({ user: person('viewer') });

  expect(useWorkspaceStore.getState()).toMatchObject({ readOnly: true, readOnlyReason: 'view-only' });
  expect(getActiveSync()!.pendingCommands()).toHaveLength(1);
  expect(t.fetchWorkspace).toHaveBeenCalledTimes(1);
  expect(t.openEvents).toHaveBeenCalledTimes(1);
  stop();
});

it('tries the role re-check once more after a short wait before warning', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  try {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    useAuthStore.setState({ status: 'signed-in', user: person('editor') });
    let meCalls = 0;
    fetchSpy.mockImplementation(async (input) => {
      if (String(input) !== '/auth/me') return json({ people: [] });
      meCalls += 1;
      return meCalls === 1 ? json({}, 500) : json(person('viewer'));
    });
    const stop = await startServerSync(transport(forbidding()), () => false, person('editor'));
    useWorkspaceStore.getState().dispatch({ type: 'project/create', id: 'q', name: 'Local' });
    await vi.waitFor(() => expect(meCalls).toBe(1));
    await vi.advanceTimersByTimeAsync(2500);
    await vi.waitFor(() => expect(useAuthStore.getState().user?.role).toBe('viewer'));
    expect(meCalls).toBe(2);
    expect(warn).not.toHaveBeenCalled();
    stop();
  } finally {
    vi.useRealTimers();
  }
});
