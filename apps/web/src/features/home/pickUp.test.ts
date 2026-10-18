import { apply, createWorkspace, withSample, type Workspace, type WorkspaceCommand } from '@glasshouse/domain';
import { describe, expect, it } from 'vitest';
import { siteSummaries } from '../globe/sites';
import { pickUp } from './pickUp';

const AT = '2026-10-18T00:00:00.000Z';
const run = (ws: Workspace, ...cmds: WorkspaceCommand[]): Workspace =>
  cmds.reduce((w, c) => {
    const r = apply(w, c);
    if (!r.ok) throw new Error(r.error.message);
    return r.value;
  }, ws);
const sample = (): Workspace => {
  const r = withSample(createWorkspace(), AT);
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
};
const roomId = (ws: Workspace, name: string): string => siteSummaries(ws).flatMap((s) => s.rooms).find((r) => r.room.name === name)!.room.id;

describe('the “pick up where you left off” strip', () => {
  it('offers the last room this browser opened, without an editor in browser mode', () => {
    const ws = sample();
    const strip = pickUp(siteSummaries(ws), roomId(ws, 'Shaft L2'), null, null);
    expect(strip).toMatchObject({ kind: 'last', edit: null });
    expect(strip?.room.room.name).toBe('Shaft L2');
  });

  it('says who edited the room last and when, from the server', () => {
    const ws = sample();
    const id = roomId(ws, 'Server Room');
    const edits = { [id]: { roomId: id, userId: 'u-ploy', name: 'Ploy', at: '2026-10-18T08:00:00.000Z' } };
    expect(pickUp(siteSummaries(ws), id, edits, 'u-me')).toMatchObject({ kind: 'last', edit: { name: 'Ploy', at: '2026-10-18T08:00:00.000Z', byMe: false } });
    expect(pickUp(siteSummaries(ws), id, edits, 'u-ploy')?.edit?.byMe).toBe(true);
    // The server knows nothing about this room's edits (nobody signed in has changed it).
    expect(pickUp(siteSummaries(ws), roomId(ws, 'Shaft L1'), edits, 'u-me')?.edit).toBeNull();
  });

  it('offers the first room with holds when there is no last room', () => {
    const ws = sample();
    const strip = pickUp(siteSummaries(ws), null, null, null);
    expect(strip?.kind).toBe('attention');
    expect(strip?.room.room.name).toBe('MDF-1');
  });

  it('treats a last room that is gone (deleted or archived) as no last room', () => {
    const ws = sample();
    const id = roomId(ws, 'Shaft L3');
    const gone = run(ws, { type: 'room/archive', roomId: id, by: 'Few', at: AT });
    expect(pickUp(siteSummaries(gone), id, null, null)?.kind).toBe('attention');
    expect(pickUp(siteSummaries(ws), 'never-existed', null, null)?.room.room.name).toBe('MDF-1');
  });

  it('hides when there is no last room and nothing holds approval', () => {
    const ws = run(createWorkspace(), { type: 'project/create', id: 'p', name: 'P' }, { type: 'site/create', projectId: 'p', id: 's', name: 'S' }, { type: 'room/create', siteId: 's', id: 'r', floorAreaId: 'f', name: 'Quiet room' });
    expect(pickUp(siteSummaries(ws), null, null, null)).toBeNull();
    expect(pickUp(siteSummaries(ws), 'r', null, null)?.room.room.name).toBe('Quiet room');
  });
});
