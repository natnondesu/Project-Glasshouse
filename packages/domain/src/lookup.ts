import type { Id, Plan, Project, Revision, Room, Site, Workspace } from './model/types';

export interface RoomLocation {
  project: Project;
  site: Site;
  room: Room;
}

export const findProject = (ws: Workspace, id: Id): Project | null => ws.projects.find((p) => p.id === id) ?? null;

export function findSite(ws: Workspace, id: Id): { project: Project; site: Site } | null {
  for (const project of ws.projects) {
    const site = project.sites.find((s) => s.id === id);
    if (site) return { project, site };
  }
  return null;
}

export function findRoom(ws: Workspace, id: Id): RoomLocation | null {
  for (const project of ws.projects) {
    for (const site of project.sites) {
      const room = site.rooms.find((r) => r.id === id);
      if (room) return { project, site, room };
    }
  }
  return null;
}

export function currentRevision(plan: Plan): Revision {
  const revision = plan.revisions[plan.revisions.length - 1];
  if (!revision) throw new Error('Invariant violated: a plan has no revisions.');
  return revision;
}
