import { apply, createWorkspace, withSample, type Workspace, type WorkspaceCommand } from '@glasshouse/domain';
import { describe, expect, it } from 'vitest';
import { heroRoom, roomGroups } from './rooms';

const sample = () => {
  const ws = withSample(createWorkspace(), '2026-10-16T00:00:00.000Z');
  if (!ws.ok) throw new Error(ws.error.message);
  return ws.value;
};

it('groups rooms by project and site and counts what holds approval like the Review badge', () => {
  const groups = roomGroups(sample());
  const rooms = groups.flatMap((g) => g.rooms);
  const a = rooms.find((r) => r.room.name === 'Server room A')!;
  const mdf = rooms.find((r) => r.room.name === 'MDF-1')!;
  expect(a.revision.state).toBe('approved');
  expect(a.holds).toEqual({ blocks: 0, needsAck: 0 });
  expect(a.racks).toBe(3);
  expect(mdf.holds).toEqual({ blocks: 1, needsAck: 1 });
});

it('puts the last opened room in the hero, and falls back to the first room when it is gone', () => {
  const ws = sample();
  const mdf = roomGroups(ws).flatMap((g) => g.rooms).find((r) => r.room.name === 'MDF-1')!;
  expect(heroRoom(ws, mdf.room.id)?.room.name).toBe('MDF-1');
  expect(heroRoom(ws, 'gone')?.room.name).toBe('Server room A');
  expect(heroRoom(createWorkspace(), null)).toBeNull();
});

describe('archived rooms', () => {
  const archive = (ws: Workspace, command: WorkspaceCommand): Workspace => {
    const r = apply(ws, command);
    if (!r.ok) throw new Error(r.error.message);
    return r.value;
  };
  const AT = '2026-10-18T00:00:00.000Z';

  it('leaves archived rooms, and rooms in archived sites or projects, off the home page', () => {
    const ws = sample();
    const all = roomGroups(ws).flatMap((g) => g.rooms);
    const mdf = all.find((r) => r.room.name === 'MDF-1')!;
    expect(roomGroups(archive(ws, { type: 'room/archive', roomId: mdf.room.id, by: 'Few', at: AT })).flatMap((g) => g.rooms.map((r) => r.room.name))).not.toContain('MDF-1');
    expect(roomGroups(archive(ws, { type: 'site/archive', siteId: mdf.site.id, by: 'Few', at: AT }))).toEqual(roomGroups(ws).filter((g) => g.site.id !== mdf.site.id));
    expect(roomGroups(archive(ws, { type: 'project/archive', projectId: mdf.project.id, by: 'Few', at: AT })).every((g) => g.project.id !== mdf.project.id)).toBe(true);
  });

  it('never leads with an archived room, even when it was the last one opened', () => {
    const ws = sample();
    const mdf = roomGroups(ws).flatMap((g) => g.rooms).find((r) => r.room.name === 'MDF-1')!;
    const archived = archive(ws, { type: 'room/archive', roomId: mdf.room.id, by: '', at: AT });
    expect(heroRoom(archived, mdf.room.id)?.room.name).not.toBe('MDF-1');
    const everything = archive(ws, { type: 'project/archive', projectId: mdf.project.id, by: '', at: AT });
    expect(heroRoom(everything, mdf.room.id)?.project.id).not.toBe(mdf.project.id);
  });
});
