import { castDraft, produce } from 'immer';
import { newId } from './ids';
import { currentRevision, findProject, findRoom, findSite } from './lookup';
import { migrate } from './migrations';
import { CURRENT_SCHEMA_VERSION, LIMITS } from './model/defaults';
import type { Id, Project, RevisionState, Template, Workspace } from './model/types';
import { err, ok, type Result } from './result';
import { workspaceSchema } from './schema';

export const PROJECT_FILE_FORMAT = 'glasshouse.project' as const;

export interface ProjectFile {
  format: typeof PROJECT_FILE_FORMAT;
  schemaVersion: number;
  exportedAt: string;
  project: Project;
  templates: Template[];
}

export function exportProjectFile(ws: Workspace, projectId: Id, exportedAt: string): Result<ProjectFile> {
  const project = findProject(ws, projectId);
  if (!project) return err('not_found', 'That project no longer exists.', [projectId]);
  const used = new Map<string, Template>();
  for (const site of project.sites) {
    for (const room of site.rooms) {
      for (const revision of room.plan.revisions) {
        for (const t of revision.content.templatesUsed) used.set(`${t.id}@${t.version}`, t);
      }
    }
  }
  return ok({ format: PROJECT_FILE_FORMAT, schemaVersion: CURRENT_SCHEMA_VERSION, exportedAt, project, templates: [...used.values()] });
}

/** Validates a file by wrapping it as a one-project workspace, so it goes through the same migrations and schema. */
export function parseProjectFile(raw: unknown): Result<ProjectFile> {
  if (typeof raw !== 'object' || raw === null || (raw as { format?: unknown }).format !== PROJECT_FILE_FORMAT) {
    return err('invalid_value', "This isn't a Glasshouse project file.");
  }
  const r = raw as { schemaVersion?: unknown; exportedAt?: unknown; project?: unknown; templates?: unknown };
  const migrated = migrate({ schemaVersion: r.schemaVersion, projects: [r.project], catalog: r.templates ?? [], lastBackupAt: null });
  if (!migrated.ok) return migrated;
  const parsed = workspaceSchema.safeParse(migrated.value);
  const project = parsed.success ? parsed.data.projects[0] : undefined;
  if (!parsed.success || !project) {
    const first = parsed.success ? undefined : parsed.error.issues[0];
    return err('invalid_value', `The project file is damaged${first ? ` (at ${first.path.join('.') || 'root'}: ${first.message})` : ''}.`);
  }
  return ok({
    format: PROJECT_FILE_FORMAT,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    exportedAt: typeof r.exportedAt === 'string' ? r.exportedAt : '',
    project,
    templates: parsed.data.catalog,
  });
}

export interface RoomConflict {
  roomId: Id;
  siteName: string;
  roomName: string;
  local: { revision: number; state: RevisionState };
  incoming: { revision: number; state: RevisionState };
}

export interface ImportPreview {
  projectName: string;
  projectExists: boolean;
  conflicts: RoomConflict[];
  newRooms: number;
  newTemplates: number;
  /** A site or room ID in the file already belongs to a different local project: only a copy is safe. */
  idClash: boolean;
}

export type ImportResolution = { mode: 'copy' } | { mode: 'merge'; takeIncoming: Id[] };

function latestTemplates(templates: Template[]): Template[] {
  const byId = new Map<Id, Template>();
  for (const t of templates) {
    const seen = byId.get(t.id);
    if (!seen || t.version > seen.version) byId.set(t.id, t);
  }
  return [...byId.values()];
}

export function previewImport(ws: Workspace, file: ProjectFile): ImportPreview {
  const conflicts: RoomConflict[] = [];
  let newRooms = 0;
  let idClash = false;
  for (const site of file.project.sites) {
    const localSite = findSite(ws, site.id);
    if (localSite && localSite.project.id !== file.project.id) idClash = true;
    for (const room of site.rooms) {
      const here = findRoom(ws, room.id);
      if (!here) {
        newRooms += 1;
        continue;
      }
      if (here.project.id !== file.project.id) {
        idClash = true;
        continue;
      }
      const a = currentRevision(here.room.plan);
      const b = currentRevision(room.plan);
      conflicts.push({
        roomId: room.id,
        siteName: site.name,
        roomName: room.name,
        local: { revision: a.number, state: a.state },
        incoming: { revision: b.number, state: b.state },
      });
    }
  }
  return {
    projectName: file.project.name,
    projectExists: findProject(ws, file.project.id) !== null,
    conflicts,
    newRooms,
    newTemplates: latestTemplates(file.templates).filter((t) => !ws.catalog.some((c) => c.id === t.id)).length,
    idClash,
  };
}

function mergeProject(local: Project, incoming: Project, take: ReadonlySet<Id>): Project {
  const sites = local.sites.map((site) => {
    const inc = incoming.sites.find((s) => s.id === site.id);
    if (!inc) return site;
    const rooms = site.rooms.map((room) => {
      const theirs = inc.rooms.find((r) => r.id === room.id);
      return theirs && take.has(room.id) ? theirs : room;
    });
    const added = inc.rooms.filter((r) => !site.rooms.some((x) => x.id === r.id));
    return { ...site, rooms: [...rooms, ...added] };
  });
  const newSites = incoming.sites.filter((s) => !local.sites.some((x) => x.id === s.id));
  return { ...local, sites: [...sites, ...newSites] };
}

const COPY_SUFFIX = ' (copy)';

function copyProject(p: Project): Project {
  return {
    ...p,
    id: newId(),
    name: `${p.name.slice(0, LIMITS.nameMaxLength - COPY_SUFFIX.length)}${COPY_SUFFIX}`,
    isSample: false,
    sites: p.sites.map((s) => ({ ...s, id: newId(), rooms: s.rooms.map((r) => ({ ...r, id: newId() })) })),
  };
}

export function applyImport(ws: Workspace, file: ProjectFile, resolution: ImportResolution): Result<Workspace> {
  const additions = latestTemplates(file.templates).filter((t) => !ws.catalog.some((c) => c.id === t.id));
  if (resolution.mode === 'copy') {
    const copy = copyProject(file.project);
    return ok(
      produce(ws, (d) => {
        d.projects.push(castDraft(copy));
        d.catalog.push(...castDraft(additions));
      }),
    );
  }
  if (previewImport(ws, file).idClash) {
    return err('invalid_value', 'Some sites or rooms in this file already belong to another project here. Import it as a copy instead.');
  }
  const local = findProject(ws, file.project.id);
  const merged = local ? mergeProject(local, file.project, new Set(resolution.takeIncoming)) : file.project;
  return ok(
    produce(ws, (d) => {
      const i = d.projects.findIndex((p) => p.id === merged.id);
      if (i === -1) d.projects.push(castDraft(merged));
      else d.projects[i] = castDraft(merged);
      d.catalog.push(...castDraft(additions));
    }),
  );
}
