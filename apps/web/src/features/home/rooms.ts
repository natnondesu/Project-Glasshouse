import { currentRevision, racksOf, revisionIssues, roomPower, type Project, type Revision, type Room, type Site, type Workspace } from '@glasshouse/domain';

export interface RoomSummary {
  room: Room;
  site: Site;
  project: Project;
  revision: Revision;
  racks: number;
  devices: number;
  knownW: number;
  limitW: number;
  /** Devices and reserved ranges whose draw nobody knows yet: never counted as zero. */
  unknownDemand: number;
  /** What still holds approval, counted the way the Review badge counts it; all zero once approved. */
  holds: { blocks: number; needsAck: number };
}

function summarise(project: Project, site: Site, room: Room): RoomSummary {
  const revision = currentRevision(room.plan);
  const racks = racksOf(revision.content);
  const power = roomPower(revision.content);
  const issues = revision.state === 'approved' ? [] : revisionIssues(revision);
  return {
    room,
    site,
    project,
    revision,
    racks: racks.length,
    devices: racks.reduce((n, r) => n + r.devices.length, 0),
    knownW: power.knownW,
    limitW: power.limitW,
    unknownDemand: power.unknownDevices + power.unknownReserved,
    holds: {
      blocks: issues.filter((i) => i.severity === 'block').length,
      needsAck: issues.filter((i) => i.severity === 'needs_ack').length,
    },
  };
}

/** Every room still in use, grouped by project then site, in the tree's order. Archived ones are the tree's to show, on request. */
export function roomGroups(workspace: Workspace): { project: Project; site: Site; rooms: RoomSummary[] }[] {
  return workspace.projects
    .filter((project) => project.archivedAt === undefined)
    .flatMap((project) =>
      project.sites
        .filter((site) => site.archivedAt === undefined)
        .map((site) => ({ project, site, rooms: site.rooms.filter((room) => room.archivedAt === undefined).map((room) => summarise(project, site, room)) })),
    );
}
