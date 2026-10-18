import { createWorkspace, withSample, type Workspace } from '@glasshouse/domain';
import { describe, expect, it } from 'vitest';
import { siteSummaries } from '../globe/sites';
import { filterCounts, filterRooms, parseFilter, scopedRooms } from './homeRooms';
import { narrowSites, queryWords } from './homeSearch';

const sample = (): Workspace => {
  const r = withSample(createWorkspace(), '2026-10-18T00:00:00.000Z');
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
};
const names = (rooms: { room: { name: string } }[]) => rooms.map((r) => r.room.name);

describe('the room grid’s filter chips', () => {
  it('counts every chip within what is in scope', () => {
    const rooms = scopedRooms(siteSummaries(sample()));
    expect(filterCounts(rooms)).toEqual({ all: 7, attention: 2, draft: 5, approved: 2 });
  });

  it('keeps the rooms a chip names, in the tree’s order', () => {
    const rooms = scopedRooms(siteSummaries(sample()));
    expect(names(filterRooms(rooms, 'all'))).toEqual(['Server room A', 'MDF-1', 'Server Room', 'Shaft L1', 'Shaft L2', 'Shaft L3', 'Comms Room']);
    expect(names(filterRooms(rooms, 'attention'))).toEqual(['MDF-1', 'Server Room']);
    expect(names(filterRooms(rooms, 'draft'))).toEqual(['MDF-1', 'Server Room', 'Shaft L2', 'Shaft L3', 'Comms Room']);
    expect(names(filterRooms(rooms, 'approved'))).toEqual(['Server room A', 'Shaft L1']);
  });

  it('combines the scope, the search and the chip', () => {
    const sites = siteSummaries(sample()).filter((s) => s.site.name === 'Riverside Campus');
    const rooms = scopedRooms(narrowSites(sites, queryWords('room')));
    expect(names(rooms)).toEqual(['Server Room']);
    expect(filterCounts(rooms)).toEqual({ all: 1, attention: 1, draft: 1, approved: 0 });
    expect(filterRooms(rooms, 'approved')).toEqual([]);
  });

  it.each([
    [null, 'all'],
    ['attention', 'attention'],
    ['draft', 'draft'],
    ['approved', 'approved'],
    ['nonsense', 'all'],
  ] as const)('reads ?rooms=%s as %s', (param, filter) => {
    expect(parseFilter(param)).toBe(filter);
  });
});
