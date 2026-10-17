import { createWorkspace, SAMPLE_PROJECT_NAME, SHOWCASE_PROJECT_NAME } from '@glasshouse/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryRepository } from '../storage/memoryRepository';
import { hydrate, startPersistence, UNLOAD_JOURNAL_KEY } from './persistence';
import { resetWorkspaceStore, useWorkspaceStore } from './workspaceStore';

const store = () => useWorkspaceStore.getState();

describe('persistence', () => {
  beforeEach(() => {
    resetWorkspaceStore();
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it('starts a fresh workspace with the Sample Project when nothing is stored (AC18)', async () => {
    await hydrate(createMemoryRepository());
    expect(store().load).toEqual({ kind: 'ready' });
    // The small sample to start with, and the showcase of everything.
    expect(store().workspace.projects).toMatchObject([{ name: SAMPLE_PROJECT_NAME, isSample: true }, { name: SHOWCASE_PROJECT_NAME, isSample: true }]);
  });

  it('does not seed a sample in a read-only tab', async () => {
    useWorkspaceStore.getState().setReadOnly(true);
    const repo = createMemoryRepository();
    await hydrate(repo);
    expect(store().workspace.projects).toEqual([]);
    expect(repo.saved).toBeNull();
  });

  it('stores the seeded workspace at once, so a reload keeps the same sample and its room links', async () => {
    const repo = createMemoryRepository();
    await hydrate(repo);
    expect(repo.saved).toBe(store().workspace);
  });

  it('keeps corrupted data and reports it instead of resetting', async () => {
    const raw = { schemaVersion: 1, projects: 'nope' };
    const repo = createMemoryRepository(raw);
    await hydrate(repo);
    expect(store().load).toMatchObject({ kind: 'failed', raw });
    expect(repo.saved).toBe(raw);
  });

  it('saves after the debounce and reports success', async () => {
    const repo = createMemoryRepository();
    await hydrate(repo);
    const stop = startPersistence(repo, 400);
    store().dispatch({ type: 'project/create', id: 'p', name: 'Northgate' });
    expect(store().save).toEqual({ kind: 'saving' });
    await vi.advanceTimersByTimeAsync(400);
    expect(store().save.kind).toBe('saved');
    expect((repo.saved as ReturnType<typeof createWorkspace>).projects.filter((p) => !p.isSample).map((p) => p.name)).toEqual(['Northgate']);
    stop();
  });

  it('reports a failed save with its reason', async () => {
    const repo = createMemoryRepository();
    await hydrate(repo);
    const stop = startPersistence(repo, 400);
    repo.failNextSave('Quota exceeded');
    store().dispatch({ type: 'project/create', id: 'p', name: 'Northgate' });
    await vi.advanceTimersByTimeAsync(400);
    expect(store().save).toEqual({ kind: 'failed', reason: 'Quota exceeded' });
    stop();
  });

  it('flushes a pending save when stopped', async () => {
    const repo = createMemoryRepository();
    await hydrate(repo);
    const stop = startPersistence(repo, 400);
    store().dispatch({ type: 'project/create', id: 'p', name: 'Northgate' });
    stop();
    await vi.runAllTimersAsync();
    expect((repo.saved as ReturnType<typeof createWorkspace>).projects.filter((p) => !p.isSample)).toHaveLength(1);
  });
});

describe('read-only tabs', () => {
  beforeEach(() => resetWorkspaceStore());

  it('never saves from a read-only tab', async () => {
    vi.useFakeTimers();
    const repo = createMemoryRepository();
    useWorkspaceStore.getState().setReadOnly(true);
    await hydrate(repo);
    const stop = startPersistence(repo, 400);
    useWorkspaceStore.setState({ workspace: { ...useWorkspaceStore.getState().workspace, lastBackupAt: 'x' } });
    await vi.advanceTimersByTimeAsync(400);
    expect(repo.saved).toBeNull();
    stop();
    vi.useRealTimers();
  });
});

describe('unload journal', () => {
  beforeEach(() => {
    resetWorkspaceStore();
    localStorage.clear();
  });

  it('writes an unsaved change synchronously when the page is hidden, and hydrate replays it', async () => {
    vi.useFakeTimers();
    const repo = createMemoryRepository();
    await hydrate(repo);
    const stop = startPersistence(repo, 400);
    store().dispatch({ type: 'project/create', id: 'p', name: 'Northgate' });
    window.dispatchEvent(new Event('pagehide'));
    expect(localStorage.getItem(UNLOAD_JOURNAL_KEY)).toContain('Northgate');
    stop();
    vi.useRealTimers();

    // The IndexedDB write never finished: the next load must still see the change.
    const stale = createMemoryRepository(JSON.parse(JSON.stringify({ ...store().workspace, projects: store().workspace.projects.filter((p) => p.isSample) })));
    resetWorkspaceStore();
    await hydrate(stale);
    expect(store().workspace.projects.map((p) => p.name)).toContain('Northgate');
    expect((stale.saved as ReturnType<typeof createWorkspace>).projects.map((p) => p.name)).toContain('Northgate');
    expect(localStorage.getItem(UNLOAD_JOURNAL_KEY)).toBeNull();
  });

  it('ignores a damaged journal and keeps stored data', async () => {
    localStorage.setItem(UNLOAD_JOURNAL_KEY, '{nope');
    const repo = createMemoryRepository();
    await hydrate(repo);
    expect(store().load).toEqual({ kind: 'ready' });
    expect(localStorage.getItem(UNLOAD_JOURNAL_KEY)).toBeNull();
  });
});
