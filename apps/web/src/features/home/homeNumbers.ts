import type { SiteSummary } from '../globe/sites';
import { holdsTotal, type RoomSummary } from './rooms';

export interface HomeNumbers {
  sites: number;
  /** Sites in scope with no location: the world view counts them and says so. */
  unplaced: number;
  rooms: number;
  approved: number;
  draft: number;
  inReview: number;
  racks: number;
  devices: number;
  knownW: number;
  limitW: number;
  /** Draws nobody knows yet: never counted as zero. */
  unknownDemand: number;
  blocks: number;
  needsAck: number;
  /** Rooms with anything holding approval. */
  roomsHeld: number;
  /** The one room holding approval, when it is just one: its count can lead straight to its Review. */
  heldRoomId: string | null;
}

const sum = (rooms: RoomSummary[], pick: (r: RoomSummary) => number): number => rooms.reduce((n, r) => n + pick(r), 0);
const count = (rooms: RoomSummary[], test: (r: RoomSummary) => boolean): number => rooms.filter(test).length;

/** What Home's strip says about the sites in scope (already narrowed by any search): every figure from the rooms themselves. */
export function homeNumbers(sites: SiteSummary[]): HomeNumbers {
  const rooms = sites.flatMap((s) => s.rooms);
  const held = rooms.filter((r) => r.revision.state !== 'approved' && holdsTotal(r) > 0);
  return {
    sites: sites.length,
    unplaced: sites.filter((s) => s.location === null).length,
    rooms: rooms.length,
    approved: count(rooms, (r) => r.revision.state === 'approved'),
    draft: count(rooms, (r) => r.revision.state === 'draft'),
    inReview: count(rooms, (r) => r.revision.state === 'in_review'),
    racks: sum(rooms, (r) => r.racks),
    devices: sum(rooms, (r) => r.devices),
    knownW: sum(rooms, (r) => r.knownW),
    limitW: sum(rooms, (r) => r.limitW),
    unknownDemand: sum(rooms, (r) => r.unknownDemand),
    blocks: sum(held, (r) => r.holds.blocks),
    needsAck: sum(held, (r) => r.holds.needsAck),
    roomsHeld: held.length,
    heldRoomId: held.length === 1 ? held[0]!.room.id : null,
  };
}

/** Planned power as a whole percent of the rooms' limits; null when no room has a limit set. */
export function powerShare(knownW: number, limitW: number): { pct: number; over: boolean } | null {
  if (limitW <= 0) return null;
  return { pct: Math.round((knownW / limitW) * 100), over: knownW > limitW };
}

/** Kilowatts with one decimal, as the strip speaks of a whole scope's power ("35.3", "68.8 kW"). */
export const kw = (w: number): string => (Math.round(w / 100) / 10).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
