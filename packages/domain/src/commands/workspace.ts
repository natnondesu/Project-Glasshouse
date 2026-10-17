import { castDraft, produce, type Draft } from 'immer';
import { createPlan } from '../factories';
import { currentRevision, findProject, findRoom, findSite } from '../lookup';
import type { Id, PlanContent, Room, Site, Workspace, EquipmentState } from '../model/types';
import { err, ok, type Result } from '../result';
import { LIMITS } from '../model/defaults';
import { validateName } from '../validation';
import { canonicalJson } from '../canonical';
import { applyCatalogCommand, type CatalogCommand } from './catalog';
import { applyPlanCommand, type PlanCommand } from './plan';
import { applyReviewCommand, type ReviewCommand } from './review';
import { applyImport, type ImportResolution, type ProjectFile } from '../projectFile';
import { withSample } from '../sample';
import { setEquipmentState } from '../equipmentState';
import { setRackOrder } from '../rackOrder';

export type WorkspaceCommand =
  | { type: 'project/create'; id: Id; name: string }
  | { type: 'project/rename'; projectId: Id; name: string }
  | { type: 'project/delete'; projectId: Id }
  | { type: 'site/create'; projectId: Id; id: Id; name: string }
  | { type: 'site/rename'; siteId: Id; name: string }
  | { type: 'site/delete'; siteId: Id }
  | { type: 'room/create'; siteId: Id; id: Id; floorAreaId: Id; name: string }
  | { type: 'room/rename'; roomId: Id; name: string }
  | { type: 'room/delete'; roomId: Id }
  | { type: 'plan'; roomId: Id; command: PlanCommand }
  /** Undo/redo: restores a draft, but only if it is still what the user saw — never over someone else's edit. */
  | { type: 'draft/replace'; roomId: Id; content: PlanContent; expected: PlanContent }
  | { type: 'review'; roomId: Id; command: ReviewCommand }
  | { type: 'backup/mark'; at: string }
  | { type: 'sample/load'; at: string }
  | { type: 'equipment/state'; roomId: Id; ids: Id[]; state: EquipmentState }
  | { type: 'rack/order'; roomId: Id; ids: Id[] | null }
  | { type: 'project/import'; file: ProjectFile; resolution: ImportResolution }
  | CatalogCommand;

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

/** True when any string anywhere in the value is longer than `max` (commands carry whole files on import). */
function hasOverlongText(value: unknown, max: number): boolean {
  if (typeof value === 'string') return value.length > max;
  if (Array.isArray(value)) return value.some((v) => hasOverlongText(v, max));
  if (value !== null && typeof value === 'object') return Object.values(value).some((v) => hasOverlongText(v, max));
  return false;
}

export function apply(ws: Workspace, cmd: WorkspaceCommand): Result<Workspace> {
  if (hasOverlongText(cmd, LIMITS.storedTextMaxLength)) {
    return err('invalid_value', `Text is limited to ${LIMITS.storedTextMaxLength.toLocaleString('en')} characters.`);
  }
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
      if (typeof cmd.floorAreaId !== 'string' || cmd.floorAreaId.length === 0 || cmd.floorAreaId === cmd.id) {
        return err('invalid_value', 'A new room needs its own floor area ID.', [cmd.id]);
      }
      return ok(produce(ws, (d) => {
        draftSite(d, cmd.siteId).rooms.push(castDraft({ id: cmd.id, name: name.value, notes: '', plan: createPlan(cmd.floorAreaId) }));
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
    case 'template/create':
    case 'template/update':
    case 'template/delete':
    case 'catalog/seed':
    case 'catalog/import': {
      const result = applyCatalogCommand(ws.catalog, cmd);
      if (!result.ok) return result;
      return ok(produce(ws, (d) => void (d.catalog = castDraft(result.value))));
    }
    case 'project/import':
      return applyImport(ws, cmd.file, cmd.resolution);
    case 'equipment/state': {
      const loc = findRoom(ws, cmd.roomId);
      if (!loc) return gone('room', cmd.roomId);
      const result = setEquipmentState(loc.room.plan, cmd.ids, cmd.state);
      if (!result.ok) return result;
      return ok(produce(ws, (d) => void (draftRoom(d, cmd.roomId).plan = castDraft(result.value))));
    }
    case 'rack/order': {
      const loc = findRoom(ws, cmd.roomId);
      if (!loc) return gone('room', cmd.roomId);
      const result = setRackOrder(loc.room.plan, cmd.ids);
      if (!result.ok) return result;
      return ok(produce(ws, (d) => void (draftRoom(d, cmd.roomId).plan = castDraft(result.value))));
    }
    case 'sample/load':
      return withSample(ws, cmd.at);
    case 'backup/mark':
      return ok(produce(ws, (d) => void (d.lastBackupAt = cmd.at)));
    case 'review': {
      const loc = findRoom(ws, cmd.roomId);
      if (!loc) return gone('room', cmd.roomId);
      const result = applyReviewCommand(loc.room.plan, cmd.command);
      if (!result.ok) return result;
      return ok(produce(ws, (d) => void (draftRoom(d, cmd.roomId).plan = castDraft(result.value))));
    }
    case 'draft/replace': {
      const loc = findRoom(ws, cmd.roomId);
      if (!loc) return gone('room', cmd.roomId);
      if (canonicalJson(currentRevision(loc.room.plan).content) !== canonicalJson(cmd.expected)) {
        return err('stale', 'This room changed since, so that undo would overwrite newer work.', [cmd.roomId]);
      }
      return replaceDraftContent(ws, cmd.roomId, cmd.content);
    }
    case 'plan':
      return applyToPlan(ws, cmd.roomId, cmd.command);
  }
}

/** Restores a room's Draft content wholesale; the building block for per-room undo/redo. Frozen revisions are never touched. */
export function replaceDraftContent(ws: Workspace, roomId: Id, content: PlanContent): Result<Workspace> {
  const loc = findRoom(ws, roomId);
  if (!loc) return gone('room', roomId);
  const revision = currentRevision(loc.room.plan);
  if (revision.state !== 'draft') {
    return err('not_draft', `Revision ${revision.number} is frozen. Start a new draft to edit it.`, [roomId]);
  }
  return ok(
    produce(ws, (d) => {
      const revisions = draftRoom(d, roomId).plan.revisions;
      const last = revisions[revisions.length - 1];
      if (last) last.content = castDraft(content);
    }),
  );
}
