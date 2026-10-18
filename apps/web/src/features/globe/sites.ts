import type { GeoPoint, Project, Site, Workspace } from '@glasshouse/domain';
import { roomGroups, type RoomSummary } from '../home/rooms';

export interface SiteSummary {
  site: Site;
  project: Project;
  rooms: RoomSummary[];
  racks: number;
  knownW: number;
  limitW: number;
  unknownDemand: number;
  /** What holds approval across its rooms, in the Review badge's terms. */
  holds: { blocks: number; needsAck: number };
  isSample: boolean;
  location: GeoPoint | null;
}

const sum = (rooms: RoomSummary[], pick: (r: RoomSummary) => number): number => rooms.reduce((n, r) => n + pick(r), 0);

/** Every site still in use, with its live rooms and their totals, in the tree's order. */
export function siteSummaries(workspace: Workspace): SiteSummary[] {
  return roomGroups(workspace).map(({ project, site, rooms }) => ({
    site,
    project,
    rooms,
    racks: sum(rooms, (r) => r.racks),
    knownW: sum(rooms, (r) => r.knownW),
    limitW: sum(rooms, (r) => r.limitW),
    unknownDemand: sum(rooms, (r) => r.unknownDemand),
    holds: { blocks: sum(rooms, (r) => r.holds.blocks), needsAck: sum(rooms, (r) => r.holds.needsAck) },
    isSample: project.isSample,
    location: site.location ?? null,
  }));
}

export const placed = (sites: SiteSummary[]): (SiteSummary & { location: GeoPoint })[] => sites.filter((s): s is SiteSummary & { location: GeoPoint } => s.location !== null);
export const notPlaced = (sites: SiteSummary[]): SiteSummary[] => sites.filter((s) => s.location === null);
