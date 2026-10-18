import { produce } from 'immer';
import type { WorkspaceCommand } from './commands/workspace';
import { findProject, findRoom, findSite } from './lookup';
import type { Id, Project, Room, Site, Workspace } from './model/types';
import { err, ok, type Failure, type Result } from './result';
import { validateName } from './validation';

/**
 * Archiving retires a project, site or room without deleting it: approved revisions and install sheets stay readable,
 * everything is read-only, and an admin can restore it at any time. The stamp is stored only on the item that was
 * archived; whatever sits below it is archived with it, and comes back with it unless it carries a stamp of its own.
 */
export type ArchiveKind = 'project' | 'site' | 'room';

export type ArchiveCommand =
  | { type: 'project/archive'; projectId: Id; by: string; at: string }
  | { type: 'project/restore'; projectId: Id }
  | { type: 'site/archive'; siteId: Id; by: string; at: string }
  | { type: 'site/restore'; siteId: Id }
  | { type: 'room/archive'; roomId: Id; by: string; at: string }
  | { type: 'room/restore'; roomId: Id };

/** The item whose stamp archives something: what to restore, who archived it and when. */
export interface ArchiveSource {
  kind: ArchiveKind;
  id: Id;
  name: string;
  at: string;
  /** Null when no name was given (a browser-local workspace may not know one). */
  by: string | null;
}

export interface ArchiveState {
  archived: boolean;
  /** The item itself, or the site or project above it. When both are archived, the higher one: it is restored first. */
  by: 'self' | 'site' | 'project' | null;
  source: ArchiveSource | null;
}

const NOT_ARCHIVED: ArchiveState = { archived: false, by: null, source: null };
const LABEL: Record<ArchiveKind, string> = { project: 'Project', site: 'Site', room: 'Room' };
const lower = (kind: ArchiveKind): string => LABEL[kind].toLowerCase();

type Stamped = Pick<Project | Site | Room, 'id' | 'name' | 'archivedAt' | 'archivedBy'>;
type Chain = [ArchiveKind, Stamped][];

/** The item and the ones above it, highest first. Empty when the id doesn't exist. */
function chainOf(ws: Workspace, kind: ArchiveKind, id: Id): Chain {
  if (kind === 'project') {
    const project = findProject(ws, id);
    return project ? [['project', project]] : [];
  }
  if (kind === 'site') {
    const loc = findSite(ws, id);
    return loc ? [['project', loc.project], ['site', loc.site]] : [];
  }
  const loc = findRoom(ws, id);
  return loc ? [['project', loc.project], ['site', loc.site], ['room', loc.room]] : [];
}

export function archiveState(ws: Workspace, kind: ArchiveKind, id: Id): ArchiveState {
  const top = chainOf(ws, kind, id).find(([, item]) => item.archivedAt !== undefined);
  if (!top) return NOT_ARCHIVED;
  const [sourceKind, item] = top;
  return {
    archived: true,
    by: sourceKind === kind ? 'self' : (sourceKind as 'site' | 'project'),
    source: { kind: sourceKind, id: item.id, name: item.name, at: item.archivedAt!, by: item.archivedBy ?? null },
  };
}

/** True when the item or anything above it is archived. */
export const isArchived = (ws: Workspace, kind: ArchiveKind, id: Id): boolean => archiveState(ws, kind, id).archived;

function roomsIn(item: Project | Site | Room, kind: ArchiveKind): Room[] {
  if (kind === 'room') return [item as Room];
  if (kind === 'site') return (item as Site).rooms;
  return (item as Project).sites.flatMap((s) => s.rooms);
}

/** Every room at or under the item, archived or not. */
export function roomsUnder(ws: Workspace, kind: ArchiveKind, id: Id): Room[] {
  const own = chainOf(ws, kind, id).at(-1);
  return own ? roomsIn(own[1] as Project | Site | Room, kind) : [];
}

/** What archiving the item takes out of sight: the sites and rooms below it that are still live. */
export function archiveScope(ws: Workspace, kind: ArchiveKind, id: Id): { sites: number; rooms: number } {
  const own = chainOf(ws, kind, id).at(-1)?.[1];
  const live = (rooms: Room[]): number => rooms.filter((r) => r.archivedAt === undefined).length;
  if (!own || kind === 'room') return { sites: 0, rooms: 0 };
  if (kind === 'site') return { sites: 0, rooms: live((own as Site).rooms) };
  const sites = (own as Project).sites.filter((s) => s.archivedAt === undefined);
  return { sites: sites.length, rooms: sites.reduce((n, s) => n + live(s.rooms), 0) };
}

/** Projects and rooms still in use: what the home page and the header count. */
export function liveCounts(ws: Workspace): { projects: number; rooms: number } {
  const live = ws.projects.filter((p) => p.archivedAt === undefined);
  const rooms = live.flatMap((p) => p.sites.filter((s) => s.archivedAt === undefined)).reduce((n, s) => n + s.rooms.filter((r) => r.archivedAt === undefined).length, 0);
  return { projects: live.length, rooms };
}

/** The rooms an archive command would take out of use (for the server's claim check). Empty for restores. */
export function roomsArchivedBy(ws: Workspace, cmd: WorkspaceCommand): Room[] {
  switch (cmd.type) {
    case 'project/archive':
      return roomsUnder(ws, 'project', cmd.projectId);
    case 'site/archive':
      return roomsUnder(ws, 'site', cmd.siteId);
    case 'room/archive':
      return roomsUnder(ws, 'room', cmd.roomId);
    default:
      return [];
  }
}

const gone = (kind: ArchiveKind, id: Id) => err('not_found', `That ${lower(kind)} no longer exists.`, [id]);

function nameOf(ws: Workspace, kind: ArchiveKind, id: Id): string {
  return chainOf(ws, kind, id).at(-1)?.[1].name ?? '';
}

type Purpose = 'edit' | 'import' | 'delete';

/** A change to something archived, refused with the way out. */
function readOnly(ws: Workspace, kind: ArchiveKind, id: Id, purpose: Purpose = 'edit'): Failure | null {
  const state = archiveState(ws, kind, id);
  const source = state.source;
  if (!source) return null;
  const name = nameOf(ws, kind, id);
  const own = state.by === 'self';
  const via = `${LABEL[kind]} ${name} is archived with ${lower(source.kind)} ${source.name}.`;
  const restore = `Restore ${LABEL[source.kind]} ${source.name}`;
  if (purpose === 'delete') {
    const message = own ? `Restore ${LABEL[kind]} ${name} before deleting it.` : `${restore} before deleting ${lower(kind)} ${name}.`;
    return err('archived', message, [id], { purpose, kind, name, sourceKind: source.kind, sourceName: source.name, own: own ? '1' : '0' });
  }
  const what = purpose === 'import' ? 'import into it' : 'make changes';
  const params = { purpose, kind, name, sourceKind: source.kind, sourceName: source.name, own: own ? '1' : '0' };
  if (own) return err('archived', `${LABEL[kind]} ${name} is archived. Restore it to ${what}.`, [id], params);
  return err('archived', `${via} ${restore} to ${what}.`, [id], params);
}

/**
 * Refuses a change to an archived project, site or room, or anything inside one. Every command type is listed, so a new
 * one can't compile until someone decides whether it is an edit. Archive and restore have their own rules.
 */
export function archiveGuard(ws: Workspace, cmd: WorkspaceCommand): Failure | null {
  switch (cmd.type) {
    case 'project/rename':
    case 'site/create':
      return readOnly(ws, 'project', cmd.projectId);
    case 'site/rename':
    case 'room/create':
      return readOnly(ws, 'site', cmd.siteId);
    case 'room/rename':
    case 'plan':
    case 'review':
    case 'draft/replace':
    case 'equipment/state':
    case 'rack/order':
      return readOnly(ws, 'room', cmd.roomId);
    case 'project/delete':
      return readOnly(ws, 'project', cmd.projectId, 'delete');
    case 'site/delete':
      return readOnly(ws, 'site', cmd.siteId, 'delete');
    case 'room/delete':
      return readOnly(ws, 'room', cmd.roomId, 'delete');
    case 'project/import':
      return importGuard(ws, cmd);
    // Not changes to anything that can be archived: a new project, the catalog, the backup stamp, the samples, and archiving itself.
    case 'project/create':
    case 'project/archive':
    case 'project/restore':
    case 'site/archive':
    case 'site/restore':
    case 'room/archive':
    case 'room/restore':
    case 'template/create':
    case 'template/update':
    case 'template/delete':
    case 'catalog/seed':
    case 'catalog/import':
    case 'backup/mark':
    case 'sample/load':
      return null;
    default: {
      // Compile-time only: an unlisted command type is a type error here. At run time apply() answers an unknown type itself.
      const _unlisted: never = cmd;
      return null;
    }
  }
}

/** A merge changes the local project, so it can't reach into archived parts; a copy is a new project and always can. */
function importGuard(ws: Workspace, cmd: Extract<WorkspaceCommand, { type: 'project/import' }>): Failure | null {
  if (cmd.resolution.mode !== 'merge') return null;
  const local = findProject(ws, cmd.file.project.id);
  if (!local) return null;
  const projectRefusal = readOnly(ws, 'project', local.id, 'import');
  if (projectRefusal) return projectRefusal;
  const taken = new Set(cmd.resolution.takeIncoming);
  for (const site of cmd.file.project.sites) {
    const here = local.sites.find((s) => s.id === site.id);
    if (!here) continue;
    const changes = site.rooms.some((r) => taken.has(r.id) || !here.rooms.some((x) => x.id === r.id));
    const refusal = changes ? readOnly(ws, 'site', here.id, 'import') : null;
    if (refusal) return refusal;
  }
  for (const id of taken) {
    const refusal = findRoom(ws, id) ? readOnly(ws, 'room', id, 'import') : null;
    if (refusal) return refusal;
  }
  return null;
}

/** The project with every archive stamp removed: a file can't archive or restore anything here, and a copy starts active. */
export function withoutArchive(project: Project): Project {
  const bare = <T extends { archivedAt?: string; archivedBy?: string }>({ archivedAt: _at, archivedBy: _by, ...rest }: T) => rest;
  return { ...bare(project), sites: project.sites.map((site) => ({ ...bare(site), rooms: site.rooms.map((room) => bare(room)) })) };
}

/** Why an item can't be archived, or null when it can. */
function archiveBlocker(ws: Workspace, kind: ArchiveKind, id: Id): Failure | null {
  const chain = chainOf(ws, kind, id);
  const own = chain.at(-1);
  if (!own) return gone(kind, id);
  const name = own[1].name;
  if (own[1].archivedAt !== undefined) return err('invalid_value', `${LABEL[kind]} ${name} is already archived.`, [id]);
  const state = archiveState(ws, kind, id);
  if (state.source) return err('invalid_value', `${LABEL[kind]} ${name} is archived with ${lower(state.source.kind)} ${state.source.name}.`, [id]);
  return null;
}

/** Why an item can't be restored, or null when it can. */
function restoreBlocker(ws: Workspace, kind: ArchiveKind, id: Id): Failure | null {
  const own = chainOf(ws, kind, id).at(-1);
  if (!own) return gone(kind, id);
  const state = archiveState(ws, kind, id);
  if (!state.source) return err('invalid_value', `${LABEL[kind]} ${own[1].name} isn't archived.`, [id]);
  if (state.by !== 'self') return err('invalid_value', `Restore ${LABEL[state.source.kind]} ${state.source.name} first.`, [state.source.id]);
  return null;
}

function stampOf(kind: ArchiveKind, d: { projects: Project[] }, id: Id): Project | Site | Room {
  for (const p of d.projects) {
    if (kind === 'project' && p.id === id) return p;
    for (const s of p.sites) {
      if (kind === 'site' && s.id === id) return s;
      const room = kind === 'room' ? s.rooms.find((r) => r.id === id) : undefined;
      if (room) return room;
    }
  }
  throw new Error(`Invariant violated: ${kind} ${id} vanished during an update.`);
}

function archive(ws: Workspace, kind: ArchiveKind, id: Id, by: string, at: string): Result<Workspace> {
  const blocked = archiveBlocker(ws, kind, id);
  if (blocked) return blocked;
  const who = by.trim() === '' ? ok<string | null>(null) : validateName(by, 'Name');
  if (!who.ok) return who;
  return ok(
    produce(ws, (d) => {
      const item = stampOf(kind, d, id);
      item.archivedAt = at;
      if (who.value) item.archivedBy = who.value;
    }),
  );
}

function restore(ws: Workspace, kind: ArchiveKind, id: Id): Result<Workspace> {
  const blocked = restoreBlocker(ws, kind, id);
  if (blocked) return blocked;
  return ok(
    produce(ws, (d) => {
      const item = stampOf(kind, d, id);
      delete item.archivedAt;
      delete item.archivedBy;
    }),
  );
}

export function applyArchiveCommand(ws: Workspace, cmd: ArchiveCommand): Result<Workspace> {
  switch (cmd.type) {
    case 'project/archive':
      return archive(ws, 'project', cmd.projectId, cmd.by, cmd.at);
    case 'project/restore':
      return restore(ws, 'project', cmd.projectId);
    case 'site/archive':
      return archive(ws, 'site', cmd.siteId, cmd.by, cmd.at);
    case 'site/restore':
      return restore(ws, 'site', cmd.siteId);
    case 'room/archive':
      return archive(ws, 'room', cmd.roomId, cmd.by, cmd.at);
    case 'room/restore':
      return restore(ws, 'room', cmd.roomId);
  }
}
