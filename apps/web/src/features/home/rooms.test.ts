import { createWorkspace, withSample } from '@glasshouse/domain';
import { expect, it } from 'vitest';
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
  expect(a.holds).toEqual({ blocks: 0, needsAck: 0, openNotes: 0 });
  expect(a.racks).toBe(3);
  expect(mdf.holds).toEqual({ blocks: 1, needsAck: 1, openNotes: 1 });
});

it('puts the last opened room in the hero, and falls back to the first room when it is gone', () => {
  const ws = sample();
  const mdf = roomGroups(ws).flatMap((g) => g.rooms).find((r) => r.room.name === 'MDF-1')!;
  expect(heroRoom(ws, mdf.room.id)?.room.name).toBe('MDF-1');
  expect(heroRoom(ws, 'gone')?.room.name).toBe('Server room A');
  expect(heroRoom(createWorkspace(), null)).toBeNull();
});
