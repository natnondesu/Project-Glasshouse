import { createWorkspace } from '@glasshouse/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryRepository } from '../storage/memoryRepository';
import { hydrate, startPersistence } from './persistence';
import { resetWorkspaceStore, useWorkspaceStore } from './workspaceStore';

const store = () => useWorkspaceStore.getState();

describe('persistence', () => {
  beforeEach(() => {
    resetWorkspaceStore();
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it('starts a fresh workspace when nothing is stored', async () => {
    await hydrate(createMemoryRepository());
    expect(store().load).toEqual({ kind: 'ready' });
    expect(store().workspace.projects).toEqual([]);
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
    expect((repo.saved as ReturnType<typeof createWorkspace>).projects[0]?.name).toBe('Northgate');
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
    expect((repo.saved as ReturnType<typeof createWorkspace>).projects).toHaveLength(1);
  });
});

describe('read-only tabs', () => {
  beforeEach(() => resetWorkspaceStore());

  it('never saves from a read-only tab', async () => {
    vi.useFakeTimers();
    const repo = createMemoryRepository();
    await hydrate(repo);
    useWorkspaceStore.getState().setReadOnly(true);
    const stop = startPersistence(repo, 400);
    useWorkspaceStore.setState({ workspace: { ...useWorkspaceStore.getState().workspace, lastBackupAt: 'x' } });
    await vi.advanceTimersByTimeAsync(400);
    expect(repo.saved).toBeNull();
    stop();
    vi.useRealTimers();
  });
});
