import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetWorkspaceStore, useWorkspaceStore } from './workspaceStore';

const store = () => useWorkspaceStore.getState();

describe('workspace store', () => {
  beforeEach(() => resetWorkspaceStore());

  it('applies commands and returns domain errors without changing state', () => {
    expect(store().dispatch({ type: 'project/create', id: 'p', name: 'Northgate' })).toBeNull();
    const before = store().workspace;
    expect(store().dispatch({ type: 'project/create', id: 'q', name: '' })?.message).toBe("Project name can't be empty.");
    expect(store().workspace).toBe(before);
  });

  it('undoes and redoes', () => {
    store().dispatch({ type: 'project/create', id: 'p', name: 'A' });
    store().dispatch({ type: 'project/rename', projectId: 'p', name: 'B' });
    store().undo();
    expect(store().workspace.projects[0]?.name).toBe('A');
    store().redo();
    expect(store().workspace.projects[0]?.name).toBe('B');
  });

  it('coalesces edits with the same key inside one second', () => {
    const now = vi.spyOn(Date, 'now');
    now.mockReturnValue(1000);
    store().dispatch({ type: 'project/create', id: 'p', name: 'A' });
    store().dispatch({ type: 'project/rename', projectId: 'p', name: 'AB' }, { coalesceKey: 'name' });
    now.mockReturnValue(1500);
    store().dispatch({ type: 'project/rename', projectId: 'p', name: 'ABC' }, { coalesceKey: 'name' });
    store().undo();
    expect(store().workspace.projects[0]?.name).toBe('A');
    now.mockRestore();
  });
});
