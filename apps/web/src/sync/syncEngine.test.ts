import { apply, createWorkspace, currentRevision, findRoom, type Workspace, type WorkspaceCommand } from '@glasshouse/domain';
import { describe, expect, it } from 'vitest';
import { SyncEngine } from './syncEngine';

const create = (id: string, name = id): WorkspaceCommand => ({ type: 'project/create', id, name });
const names = (ws: Workspace) => ws.projects.map((p) => p.name);
const start = () => ({ seq: 0, workspace: createWorkspace() });

function wsWithRooms(ids: string[]): Workspace {
  const commands: WorkspaceCommand[] = [
    { type: 'project/create', id: 'p', name: 'P' },
    { type: 'site/create', projectId: 'p', id: 's', name: 'S' },
    ...ids.map((id): WorkspaceCommand => ({ type: 'room/create', siteId: 's', id, floorAreaId: `fa-${id}`, name: id })),
  ];
  return commands.reduce((ws, c) => {
    const r = apply(ws, c);
    if (!r.ok) throw new Error(r.error.message);
    return r.value;
  }, createWorkspace());
}
const vlanAdd = (roomId: string, vid: number): WorkspaceCommand => ({ type: 'plan', roomId, command: { type: 'vlan/add', vlan: { vid, name: `V${vid}` } } });
const vlansOf = (ws: Workspace, roomId: string): number[] => currentRevision(findRoom(ws, roomId)!.room.plan).content.vlans.map((v) => v.vid);

describe('SyncEngine', () => {
  it('shows local edits at once and keeps them pending until the server orders them', () => {
    const e = new SyncEngine(start(), 'me');
    expect(e.local('1', create('p', 'Mine'))).toBeNull();
    expect(names(e.workspace)).toEqual(['Mine']);
    expect(e.takeUnsent().map((c) => c.commandId)).toEqual(['1']);
    expect(e.takeUnsent()).toEqual([]);
    expect(e.remote({ seq: 1, clientId: 'me', commandId: '1', command: create('p', 'Mine') })).toEqual({ kind: 'applied', dropped: [] });
    expect(e.seq).toBe(1);
    expect(names(e.workspace)).toEqual(['Mine']);
  });

  it('puts other people edits underneath mine, in server order', () => {
    const e = new SyncEngine(start(), 'me');
    e.local('1', create('mine', 'Mine'));
    e.remote({ seq: 1, clientId: 'other', commandId: 'x', command: create('theirs', 'Theirs') });
    expect(names(e.workspace)).toEqual(['Theirs', 'Mine']);
  });

  it('drops a pending edit that no longer applies and says why', () => {
    const e = new SyncEngine(start(), 'me');
    e.local('1', create('p', 'Mine'));
    const r = e.remote({ seq: 1, clientId: 'other', commandId: 'x', command: create('p', 'Theirs') });
    expect(r).toMatchObject({ kind: 'applied', dropped: [{ commandId: '1', error: { code: 'invalid_value' } }] });
    expect(names(e.workspace)).toEqual(['Theirs']);
  });

  it('returns a domain error for an edit that is invalid locally and queues nothing', () => {
    const e = new SyncEngine(start(), 'me');
    expect(e.local('1', create('p', ''))?.code).toBe('invalid_value');
    expect(e.takeUnsent()).toEqual([]);
  });

  it('ignores duplicates and asks for a resync on a gap', () => {
    const e = new SyncEngine(start(), 'me');
    e.remote({ seq: 1, clientId: 'o', commandId: 'a', command: create('a') });
    expect(e.remote({ seq: 1, clientId: 'o', commandId: 'a', command: create('a') })).toEqual({ kind: 'ignored' });
    expect(e.remote({ seq: 3, clientId: 'o', commandId: 'c', command: create('c') })).toEqual({ kind: 'resync' });
  });

  it('removes a rejected edit and replays the rest', () => {
    const e = new SyncEngine(start(), 'me');
    e.local('1', create('p', 'One'));
    e.local('2', create('q', 'Two'));
    e.rejected('1');
    expect(names(e.workspace)).toEqual(['Two']);
  });

  it('re-sends edits that were not delivered', () => {
    const e = new SyncEngine(start(), 'me');
    e.local('1', create('p'));
    e.takeUnsent();
    e.markUnsent(['1']);
    expect(e.takeUnsent().map((c) => c.commandId)).toEqual(['1']);
  });

  it('after a reset, keeps only edits the new state does not already contain', () => {
    const e = new SyncEngine(start(), 'me');
    e.local('1', create('p', 'Sent'));
    e.takeUnsent();
    e.acked('1', 1);
    e.local('2', create('q', 'Not sent yet'));
    const server = apply(createWorkspace(), create('p', 'Sent'));
    if (!server.ok) throw new Error(server.error.message);
    expect(e.reset({ seq: 1, workspace: server.value })).toEqual([]);
    expect(names(e.workspace)).toEqual(['Sent', 'Not sent yet']);
    expect(e.takeUnsent().map((c) => c.commandId)).toEqual(['2']);
  });

  it('hands out at most 500 unsent edits at a time, in order', () => {
    const e = new SyncEngine(start(), 'me');
    for (let i = 0; i < 1200; i++) e.local(`c${i}`, create(`p${i}`));
    const sizes = [e.takeUnsent().length, e.takeUnsent().length, e.takeUnsent().length, e.takeUnsent().length];
    expect(sizes).toEqual([500, 500, 200, 0]);
  });

  it('knows whether any edit is still unsent or unacknowledged', () => {
    const e = new SyncEngine(start(), 'me');
    expect(e.hasUnsaved()).toBe(false);
    e.local('1', create('p'));
    expect(e.hasUnsaved()).toBe(true);
    e.takeUnsent();
    expect(e.hasUnsaved()).toBe(true);
    e.acked('1', 1);
    expect(e.hasUnsaved()).toBe(false);
  });

  it('drops every unconfirmed draft edit to one room and keeps the rest', () => {
    const engine = new SyncEngine({ seq: 0, workspace: wsWithRooms(['r', 'q']) }, 'me');
    engine.local('1', vlanAdd('r', 10));
    engine.local('2', { type: 'room/rename', roomId: 'r', name: 'Renamed' });
    engine.local('3', vlanAdd('q', 11));
    engine.local('4', vlanAdd('r', 12));
    engine.dropDraftEdits('r');
    expect(engine.pendingList().map((p) => p.commandId)).toEqual(['2', '3']);
    expect(vlansOf(engine.workspace, 'r')).toEqual([]);
    expect(vlansOf(engine.workspace, 'q')).toEqual([11]);
  });
});
