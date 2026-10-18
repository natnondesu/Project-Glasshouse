import { currentRevision, type Id, type Project, type RevisionState } from '@glasshouse/domain';

export interface SwitcherRoom {
  id: Id;
  name: string;
  number: number;
  state: RevisionState;
  current: boolean;
}

export interface SwitcherSite {
  id: Id;
  name: string;
  rooms: SwitcherRoom[];
}

/** Past this many rooms the switcher offers a filter field; below it the whole list is one glance. */
const FILTER_AFTER_ROOMS = 8;

/**
 * The rooms of one project grouped by site, in tree order. Archived work stays out (through its site or
 * project too), except the room that is open: the switcher never hides where you are.
 */
export function switcherSites(project: Project, currentRoomId: Id): SwitcherSite[] {
  return project.sites.flatMap((site) => {
    const live = project.archivedAt === undefined && site.archivedAt === undefined;
    const rooms = site.rooms
      .filter((room) => room.id === currentRoomId || (live && room.archivedAt === undefined))
      .map((room) => {
        const revision = currentRevision(room.plan);
        return { id: room.id, name: room.name, number: revision.number, state: revision.state, current: room.id === currentRoomId };
      });
    return rooms.length > 0 ? [{ id: site.id, name: site.name, rooms }] : [];
  });
}

/** Rooms where every word of the query is in the room's or its site's name. */
export function filterSites(sites: SwitcherSite[], query: string): SwitcherSite[] {
  const words = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return sites;
  return sites.flatMap((site) => {
    const rooms = site.rooms.filter((room) => {
      const haystack = `${room.name} ${site.name}`.toLocaleLowerCase();
      return words.every((w) => haystack.includes(w));
    });
    return rooms.length > 0 ? [{ ...site, rooms }] : [];
  });
}

export const needsFilter = (sites: SwitcherSite[]): boolean => sites.reduce((n, s) => n + s.rooms.length, 0) > FILTER_AFTER_ROOMS;
