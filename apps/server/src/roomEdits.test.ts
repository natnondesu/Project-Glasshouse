import type { WorkspaceCommand } from '@glasshouse/domain';
import { describe, expect, it } from 'vitest';
import { editedRoom, RoomEdits, roomEditOf } from './roomEdits';
import type { Actor, LoggedCommand } from './store/commandStore';

const ploy = { id: 'u-ploy', name: 'Ploy', role: 'editor' as const, verified: true };
const dev = { id: 'dev:Ploy', name: 'Ploy', role: 'admin' as const, verified: false };
const entry = (seq: number, command: WorkspaceCommand, actor: Actor = ploy, receivedAt = `2026-10-18T0${seq}:00:00.000Z`): LoggedCommand => ({ seq, clientId: 'c', commandId: String(seq), actor, command, receivedAt });

describe('which room a command changes', () => {
  it.each<[WorkspaceCommand, string | null]>([
    [{ type: 'room/create', siteId: 's', id: 'r1', floorAreaId: 'f', name: 'MDF' }, 'r1'],
    [{ type: 'room/rename', roomId: 'r2', name: 'IDF' }, 'r2'],
    [{ type: 'rack/order', roomId: 'r3', ids: null }, 'r3'],
    [{ type: 'room/archive', roomId: 'r4', by: 'Few', at: 'x' }, 'r4'],
    [{ type: 'project/create', id: 'p', name: 'P' }, null],
    [{ type: 'site/rename', siteId: 's', name: 'S' }, null],
  ])('%j changes %s', (command, room) => {
    expect(editedRoom(command)).toBe(room);
  });
});

describe('a logged command as a room edit', () => {
  it('names the signed-in person and the time the server took it', () => {
    expect(roomEditOf(entry(1, { type: 'room/rename', roomId: 'r', name: 'X' }))).toEqual({ roomId: 'r', userId: 'u-ploy', name: 'Ploy', at: '2026-10-18T01:00:00.000Z' });
  });

  it('is nothing for the unverified dev stand-in, a command without a room, or one without a time', () => {
    expect(roomEditOf(entry(1, { type: 'room/rename', roomId: 'r', name: 'X' }, dev))).toBeNull();
    expect(roomEditOf(entry(2, { type: 'project/create', id: 'p', name: 'P' }))).toBeNull();
    expect(roomEditOf({ ...entry(3, { type: 'room/rename', roomId: 'r', name: 'X' }), receivedAt: undefined })).toBeNull();
  });
});

describe('the latest edit per room', () => {
  it('keeps the newest edit of each room', () => {
    const edits = new RoomEdits([{ roomId: 'a', userId: 'u1', name: 'Ada', at: '2026-10-17T00:00:00.000Z' }]);
    edits.record(entry(1, { type: 'room/rename', roomId: 'b', name: 'B' }));
    edits.record(entry(2, { type: 'room/rename', roomId: 'a', name: 'A' }));
    edits.record(entry(3, { type: 'project/create', id: 'p', name: 'P' }));
    expect(edits.list(() => true)).toEqual([
      { roomId: 'a', userId: 'u-ploy', name: 'Ploy', at: '2026-10-18T02:00:00.000Z' },
      { roomId: 'b', userId: 'u-ploy', name: 'Ploy', at: '2026-10-18T01:00:00.000Z' },
    ]);
  });

  it('lists only rooms that still exist', () => {
    const edits = new RoomEdits([
      { roomId: 'a', userId: 'u1', name: 'Ada', at: 'x' },
      { roomId: 'gone', userId: 'u1', name: 'Ada', at: 'x' },
    ]);
    expect(edits.list((id) => id !== 'gone').map((e) => e.roomId)).toEqual(['a']);
  });
});
