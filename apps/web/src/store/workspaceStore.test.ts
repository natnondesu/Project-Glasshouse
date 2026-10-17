import { apply, currentRevision, findRoom } from '@glasshouse/domain';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetAuthStore, useAuthStore } from '../auth/authStore';
import { resetClaimsStore, useClaimsStore } from '../claims/claimsStore';
import { resetWorkspaceStore, setCommit, useWorkspaceStore } from './workspaceStore';

const store = () => useWorkspaceStore.getState();
const width = (roomId: string) => currentRevision(findRoom(store().workspace, roomId)!.room.plan).content.survey.width;
const setWidth = (roomId: string, w: number, coalesceKey?: string) =>
  store().dispatch({ type: 'plan', roomId, command: { type: 'survey/update', patch: { width: w } } }, coalesceKey ? { coalesceKey } : {});

function seed(): void {
  store().dispatch({ type: 'project/create', id: 'p', name: 'P' });
  store().dispatch({ type: 'site/create', projectId: 'p', id: 's', name: 'S' });
  store().dispatch({ type: 'room/create', siteId: 's', id: 'a', floorAreaId: 'fa-a', name: 'A' });
  store().dispatch({ type: 'room/create', siteId: 's', id: 'b', floorAreaId: 'fa-b', name: 'B' });
}

describe('workspace store', () => {
  beforeEach(() => {
    resetWorkspaceStore();
    seed();
  });

  it('applies commands and returns domain errors without changing state', () => {
    const before = store().workspace;
    expect(store().dispatch({ type: 'project/create', id: 'q', name: '' })?.message).toBe("Project name can't be empty.");
    expect(store().workspace).toBe(before);
  });

  it('undoes and redoes plan edits per room, leaving other rooms alone', () => {
    setWidth('a', 6);
    setWidth('b', 7);
    store().undo('a');
    expect(width('a')).toBe(5);
    expect(width('b')).toBe(7);
    store().redo('a');
    expect(width('a')).toBe(6);
  });

  it('does not put hierarchy changes on the undo stack', () => {
    store().dispatch({ type: 'project/rename', projectId: 'p', name: 'Renamed' });
    store().undo('a');
    expect(store().workspace.projects[0]?.name).toBe('Renamed');
  });

  it('coalesces edits with the same key in the same room inside one second', () => {
    const now = vi.spyOn(Date, 'now');
    now.mockReturnValue(1000);
    setWidth('a', 6, 'width');
    now.mockReturnValue(1500);
    setWidth('a', 7, 'width');
    store().undo('a');
    expect(width('a')).toBe(5);
    now.mockRestore();
  });

  it('refuses edits while the tab is read-only', () => {
    store().setReadOnly(true);
    expect(setWidth('a', 6)?.message).toBe('This tab is read-only because Glasshouse is open in another tab.');
    expect(width('a')).toBe(5);
  });

  it('remembers why the tab is read-only, and forgets when it is not', () => {
    store().setReadOnly(true);
    expect(store().readOnlyReason).toBe('other-tab');
    store().setReadOnly(true, 'view-only');
    store().setReadOnly(true);
    expect(store().readOnlyReason).toBe('view-only');
    store().setReadOnly(false);
    expect(store().readOnlyReason).toBeNull();
  });
});

describe('review boundaries', () => {
  beforeEach(() => {
    resetWorkspaceStore();
    seed();
  });

  it('clears a room’s undo history when it is submitted for review', () => {
    setWidth('a', 6);
    setWidth('b', 7);
    store().dispatch({ type: 'review', roomId: 'a', command: { type: 'review/submit', designedBy: '', at: '2026-10-14T00:00:00.000Z' } });
    expect(store().history.a).toBeUndefined();
    expect(store().history.b?.past).toHaveLength(1);
    store().undo('a');
    expect(width('a')).toBe(6);
  });

  it('undoes through draft/replace, and refuses when the room changed since', () => {
    setWidth('a', 6);
    // Someone else's edit arrives underneath (server mode adopts it without touching undo history).
    const elsewhere = apply(store().workspace, { type: 'plan', roomId: 'a', command: { type: 'survey/update', patch: { width: 8 } } });
    if (!elsewhere.ok) throw new Error(elsewhere.error.message);
    store().adopt(elsewhere.value);
    expect(store().undo('a')?.code).toBe('stale');
    expect(width('a')).toBe(8);
    expect(store().notice).toMatch(/changed since/);
  });

  it('routes every edit through the commit hook when one is set', () => {
    const seen: string[] = [];
    setCommit((ws, command) => {
      seen.push(command.type);
      return apply(ws, command);
    });
    setWidth('a', 7);
    store().undo('a');
    expect(seen).toEqual(['plan', 'draft/replace']);
  });
});

describe('refusing edits while read-only', () => {
  beforeEach(() => {
    resetWorkspaceStore();
    seed();
  });

  it.each([
    ['view-only', 'You can view this workspace. Ask an admin for edit access.'],
    ['offline', "You're offline. Edits come back when the connection does."],
    ['other-tab', 'This tab is read-only because Glasshouse is open in another tab.'],
  ] as const)('says why for %s', (reason, message) => {
    store().setReadOnly(true, reason);
    expect(setWidth('a', 6)?.message).toBe(message);
    expect(width('a')).toBe(5);
  });
});

describe('a room someone else is editing', () => {
  beforeEach(() => {
    resetWorkspaceStore();
    resetAuthStore();
    resetClaimsStore();
    seed();
    useAuthStore.setState({ status: 'signed-in', user: { id: 'u-me', name: 'Me', email: 'me@x', role: 'editor', mustChangePassword: false } });
    useClaimsStore.getState().setClaims([{ roomId: 'a', userId: 'u-other', name: 'Ada', since: 't', lastEditAt: 't' }]);
  });

  it('refuses a plan command for that room and leaves the workspace alone', () => {
    const before = store().workspace;
    expect(setWidth('a', 6)).toEqual({ code: 'claimed', message: 'Ada is editing this room.', targets: ['a'] });
    expect(store().workspace).toBe(before);
  });

  it('refuses undo and redo for that room', () => {
    useClaimsStore.getState().setClaims([]);
    setWidth('a', 6);
    setWidth('a', 7);
    store().undo('a');
    useClaimsStore.getState().setClaims([{ roomId: 'a', userId: 'u-other', name: 'Ada', since: 't', lastEditAt: 't' }]);
    expect(store().undo('a')).toMatchObject({ code: 'claimed', targets: ['a'] });
    expect(store().redo('a')).toMatchObject({ code: 'claimed', targets: ['a'] });
    expect(width('a')).toBe(6);
  });

  it('still lets a command for another room through', () => {
    expect(setWidth('b', 7)).toBeNull();
    expect(width('b')).toBe(7);
  });
});
