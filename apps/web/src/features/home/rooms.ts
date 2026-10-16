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
  /** What still holds approval, counted the way the Review badge counts it; all zero once approved. */
  holds: { blocks: number; needsAck: number; openNotes: number };
}

export function summarise(project: Project, site: Site, room: Room): RoomSummary {
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
    holds: {
      blocks: issues.filter((i) => i.severity === 'block').length,
      needsAck: issues.filter((i) => i.severity === 'needs_ack').length,
      openNotes: revision.state === 'approved' ? 0 : room.plan.notes.filter((n) => !n.resolved).length,
    },
  };
}

/** Every room, grouped by project then site, in the tree's order. */
export function roomGroups(workspace: Workspace): { project: Project; site: Site; rooms: RoomSummary[] }[] {
  return workspace.projects.flatMap((project) => project.sites.map((site) => ({ project, site, rooms: site.rooms.map((room) => summarise(project, site, room)) })));
}

/** The hero: the room last opened if it still exists, else the first room there is. */
export function heroRoom(workspace: Workspace, lastRoomId: string | null): RoomSummary | null {
  const all = roomGroups(workspace).flatMap((g) => g.rooms);
  return all.find((r) => r.room.id === lastRoomId) ?? all[0] ?? null;
}
