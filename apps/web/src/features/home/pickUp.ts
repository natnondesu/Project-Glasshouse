import type { RoomEdit } from '../../sync/roomEdits';
import type { SiteSummary } from '../globe/sites';
import { holdsTotal, type RoomSummary } from './rooms';

export interface PickUp {
  /** `last`: the room this browser opened last. `attention`: no such room, so the first one with holds. */
  kind: 'last' | 'attention';
  room: RoomSummary;
  /** Who changed the room last and when: shared-server only, and only edits by someone signed in. */
  edit: { name: string; at: string; byMe: boolean } | null;
}

/** The workspace bar's strip: the last room opened, else the first room something holds, else nothing. */
export function pickUp(sites: SiteSummary[], lastRoomId: string | null, edits: Readonly<Record<string, RoomEdit>> | null, me: string | null): PickUp | null {
  const rooms = sites.flatMap((s) => s.rooms);
  const last = lastRoomId ? rooms.find((r) => r.room.id === lastRoomId) : undefined;
  const room = last ?? rooms.find((r) => r.revision.state !== 'approved' && holdsTotal(r) > 0);
  if (!room) return null;
  const edit = edits?.[room.room.id];
  return { kind: last ? 'last' : 'attention', room, edit: edit ? { name: edit.name, at: edit.at, byMe: me !== null && edit.userId === me } : null };
}
