import type { SiteSummary } from '../globe/sites';
import { holdsTotal, type RoomSummary } from './rooms';

export const ROOM_FILTERS = ['all', 'attention', 'draft', 'approved'] as const;
export type RoomFilter = (typeof ROOM_FILTERS)[number];

const TESTS: Record<RoomFilter, (r: RoomSummary) => boolean> = {
  all: () => true,
  attention: (r) => r.revision.state !== 'approved' && holdsTotal(r) > 0,
  draft: (r) => r.revision.state === 'draft',
  approved: (r) => r.revision.state === 'approved',
};

export const scopedRooms = (sites: SiteSummary[]): RoomSummary[] => sites.flatMap((s) => s.rooms);

export const filterRooms = (rooms: RoomSummary[], filter: RoomFilter): RoomSummary[] => rooms.filter(TESTS[filter]);

export function filterCounts(rooms: RoomSummary[]): Record<RoomFilter, number> {
  return { all: rooms.length, attention: rooms.filter(TESTS.attention).length, draft: rooms.filter(TESTS.draft).length, approved: rooms.filter(TESTS.approved).length };
}

export const parseFilter = (param: string | null): RoomFilter => (ROOM_FILTERS as readonly string[]).includes(param ?? '') ? (param as RoomFilter) : 'all';
