import { castDraft, produce, type Draft } from 'immer';
import { createPlan } from '../factories';
import { currentRevision, findProject, findRoom, findSite } from '../lookup';
import type { Id, Room, Site, Workspace } from '../model/types';
import { err, ok, type Result } from '../result';
import { validateName } from '../validation';
import { applyPlanCommand, type PlanCommand } from './plan';

export type WorkspaceCommand =
  | { type: 'project/create'; id: Id; name: string }
  | { type: 'project/rename'; projectId: Id; name: string }
  | { type: 'project/delete'; projectId: Id }
  | { type: 'site/create'; projectId: Id; id: Id; name: string }
  | { type: 'site/rename'; siteId: Id; name: string }
  | { type: 'site/delete'; siteId: Id }
  | { type: 'room/create'; siteId: Id; id: Id; name: string }
  | { type: 'room/rename'; roomId: Id; name: string }
  | { type: 'room/delete'; roomId: Id }
  | { type: 'plan'; roomId: Id; command: PlanCommand };

const gone = (what: string, id: Id) => err('not_found', `That ${what} no longer exists.`, [id]);

function draftSite(d: Draft<Workspace>, siteId: Id): Draft<Site> {
  for (const p of d.projects) {
    const site = p.sites.find((s) => s.id === siteId);
    if (site) return site;
  }
  throw new Error(`Invariant violated: site ${siteId} vanished during an update.`);
}

function draftRoom(d: Draft<Workspace>, roomId: Id): Draft<Room> {
  for (const p of d.projects) {
    for (const s of p.sites) {
      const room = s.rooms.find((r) => r.id === roomId);
      if (room) return room;
    }
  }
  throw new Error(`Invariant violated: room ${roomId} vanished during an update.`);
}

const idTaken = (ws: Workspace, id: Id): boolean =>
  findProject(ws, id) !== null || findSite(ws, id) !== null || findRoom(ws, id) !== null;

function applyToPlan(ws: Workspace, roomId: Id, command: PlanCommand): Result<Workspace> {
  const loc = findRoom(ws, roomId);
  if (!loc) return gone('room', roomId);
  const revision = currentRevision(loc.room.plan);
  if (revision.state !== 'draft') {
    return err('not_draft', `Revision ${revision.number} is frozen. Start a new draft to edit it.`, [roomId]);
  }
  const result = applyPlanCommand(revision.content, command);
  if (!result.ok) return result;
  return ok(
    produce(ws, (d) => {
      const revisions = draftRoom(d, roomId).plan.revisions;
      const last = revisions[revisions.length - 1];
      if (last) last.content = castDraft(result.value);
    }),
  );
}

export function apply(ws: Workspace, cmd: WorkspaceCommand): Result<Workspace> {
  switch (cmd.type) {
    case 'project/create': {
      const name = validateName(cmd.name, 'Project name');
      if (!name.ok) return name;
      if (idTaken(ws, cmd.id)) return err('invalid_value', 'That ID is already in use.', [cmd.id]);
      return ok(produce(ws, (d) => void d.projects.push({ id: cmd.id, name: name.value, notes: '', isSample: false, sites: [] })));
    }
    case 'project/rename': {
      const name = validateName(cmd.name, 'Project name');
      if (!name.ok) return name;
      if (!findProject(ws, cmd.projectId)) return gone('project', cmd.projectId);
      return ok(produce(ws, (d) => {
        const p = d.projects.find((x) => x.id === cmd.projectId);
        if (p) p.name = name.value;
      }));
    }
    case 'project/delete':
      if (!findProject(ws, cmd.projectId)) return gone('project', cmd.projectId);
      return ok(produce(ws, (d) => void (d.projects = d.projects.filter((p) => p.id !== cmd.projectId))));
    case 'site/create': {
      const name = validateName(cmd.name, 'Site name');
      if (!name.ok) return name;
      if (!findProject(ws, cmd.projectId)) return gone('project', cmd.projectId);
      if (idTaken(ws, cmd.id)) return err('invalid_value', 'That ID is already in use.', [cmd.id]);
      return ok(produce(ws, (d) => {
        d.projects.find((p) => p.id === cmd.projectId)?.sites.push({ id: cmd.id, name: name.value, notes: '', rooms: [] });
      }));
    }
    case 'site/rename': {
      const name = validateName(cmd.name, 'Site name');
      if (!name.ok) return name;
      if (!findSite(ws, cmd.siteId)) return gone('site', cmd.siteId);
      return ok(produce(ws, (d) => void (draftSite(d, cmd.siteId).name = name.value)));
    }
    case 'site/delete':
      if (!findSite(ws, cmd.siteId)) return gone('site', cmd.siteId);
      return ok(produce(ws, (d) => {
        for (const p of d.projects) p.sites = p.sites.filter((s) => s.id !== cmd.siteId);
      }));
    case 'room/create': {
      const name = validateName(cmd.name, 'Room name');
      if (!name.ok) return name;
      if (!findSite(ws, cmd.siteId)) return gone('site', cmd.siteId);
      if (idTaken(ws, cmd.id)) return err('invalid_value', 'That ID is already in use.', [cmd.id]);
      return ok(produce(ws, (d) => {
        draftSite(d, cmd.siteId).rooms.push(castDraft({ id: cmd.id, name: name.value, notes: '', plan: createPlan() }));
      }));
    }
    case 'room/rename': {
      const name = validateName(cmd.name, 'Room name');
      if (!name.ok) return name;
      if (!findRoom(ws, cmd.roomId)) return gone('room', cmd.roomId);
      return ok(produce(ws, (d) => void (draftRoom(d, cmd.roomId).name = name.value)));
    }
    case 'room/delete':
      if (!findRoom(ws, cmd.roomId)) return gone('room', cmd.roomId);
      return ok(produce(ws, (d) => {
        for (const p of d.projects) for (const s of p.sites) s.rooms = s.rooms.filter((r) => r.id !== cmd.roomId);
      }));
    case 'plan':
      return applyToPlan(ws, cmd.roomId, cmd.command);
  }
}
