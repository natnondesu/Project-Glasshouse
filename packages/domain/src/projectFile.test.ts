import { describe, expect, it } from 'vitest';
import { apply, type WorkspaceCommand } from './commands/workspace';
import { createWorkspace } from './factories';
import { currentRevision, findRoom } from './lookup';
import type { Rack, Template, Workspace } from './model/types';
import { createObject } from './objects';
import { applyImport, exportProjectFile, parseProjectFile, previewImport, type ProjectFile } from './projectFile';

const AT = '2026-10-14T09:00:00.000Z';
function run(ws: Workspace, ...cmds: WorkspaceCommand[]): Workspace {
  return cmds.reduce((w, cmd) => {
    const r = apply(w, cmd);
    if (!r.ok) throw new Error(r.error.message);
    return r.value;
  }, ws);
}
function source(): Workspace {
  const rack = { ...(createObject('rack', { x: 1, y: 0.6 }, []) as Rack), id: 'rk', name: 'RK-01' };
  let ws = run(
    createWorkspace(),
    { type: 'project/create', id: 'p', name: 'Northgate' },
    { type: 'site/create', projectId: 'p', id: 's', name: 'Site A' },
    { type: 'room/create', siteId: 's', id: 'r1', name: 'MDF-1' },
    { type: 'room/create', siteId: 's', id: 'r2', name: 'Server room B' },
    { type: 'plan', roomId: 'r1', command: { type: 'object/add', object: rack } },
  );
  const t = ws.catalog.find((x) => x.id === 'tpl-server-2u') as Template;
  ws = run(ws, { type: 'plan', roomId: 'r1', command: { type: 'device/place', id: 'srv', rackId: 'rk', bottomU: 1, template: t } });
  return ws;
}
const fileOf = (ws: Workspace): ProjectFile => {
  const r = exportProjectFile(ws, 'p', AT);
  if (!r.ok) throw new Error(r.error.message);
  const parsed = parseProjectFile(JSON.parse(JSON.stringify(r.value)));
  if (!parsed.ok) throw new Error(parsed.error.message);
  return parsed.value;
};
const width = (ws: Workspace, roomId: string) => currentRevision(findRoom(ws, roomId)!.room.plan).content.survey.width;

describe('project file', () => {
  it('exports the project with every revision and the template versions it uses', () => {
    const file = fileOf(source());
    expect(file).toMatchObject({ format: 'glasshouse.project', schemaVersion: 6, exportedAt: AT, project: { id: 'p', name: 'Northgate' } });
    expect(file.templates.map((t) => t.id)).toEqual(['tpl-server-2u']);
  });

  it('rejects foreign and damaged files without touching anything', () => {
    expect(parseProjectFile({ any: 1 })).toMatchObject({ ok: false, error: { message: "This isn't a Glasshouse project file." } });
    expect(parseProjectFile({ format: 'glasshouse.project', schemaVersion: 1, project: { id: 'p' }, templates: [] })).toMatchObject({ ok: false, error: { message: expect.stringMatching(/^The project file is damaged/) } });
    expect(parseProjectFile({ format: 'glasshouse.project', schemaVersion: 42, project: {}, templates: [] })).toMatchObject({ ok: false, error: { message: expect.stringMatching(/newer Glasshouse/) } });
  });

  it('imports a new project whole, including missing templates', () => {
    const file = fileOf(source());
    const target = run(createWorkspace(), { type: 'template/delete', id: 'tpl-server-2u' });
    expect(previewImport(target, file)).toMatchObject({ projectExists: false, conflicts: [], newRooms: 2, newTemplates: 1, idClash: false });
    const ws = run(target, { type: 'project/import', file, resolution: { mode: 'merge', takeIncoming: [] } });
    expect(findRoom(ws, 'r1')?.project.name).toBe('Northgate');
    expect(ws.catalog.some((t) => t.id === 'tpl-server-2u')).toBe(true);
  });

  it('AC15: lists conflicts per room and applies keep-mine / take-incoming choices', () => {
    const exported = fileOf(source());
    const local = run(
      source(),
      { type: 'plan', roomId: 'r1', command: { type: 'survey/update', patch: { width: 7 } } },
      { type: 'plan', roomId: 'r2', command: { type: 'survey/update', patch: { width: 9 } } },
      { type: 'review', roomId: 'r1', command: { type: 'review/submit', designedBy: '', at: AT } },
    );
    const preview = previewImport(local, exported);
    expect(preview.conflicts).toEqual([
      { roomId: 'r1', siteName: 'Site A', roomName: 'MDF-1', local: { revision: 1, state: 'in_review' }, incoming: { revision: 1, state: 'draft' } },
      { roomId: 'r2', siteName: 'Site A', roomName: 'Server room B', local: { revision: 1, state: 'draft' }, incoming: { revision: 1, state: 'draft' } },
    ]);
    const before = findRoom(local, 'r1')!.room;
    const ws = run(local, { type: 'project/import', file: exported, resolution: { mode: 'merge', takeIncoming: ['r2'] } });
    expect(findRoom(ws, 'r1')!.room).toEqual(before);
    expect(width(ws, 'r2')).toBe(5);
  });

  it('imports as a copy with new ids', () => {
    const local = source();
    const ws = run(local, { type: 'project/import', file: fileOf(local), resolution: { mode: 'copy' } });
    expect(ws.projects.map((p) => p.name)).toEqual(['Northgate', 'Northgate (copy)']);
    const copy = ws.projects[1]!;
    expect(copy.id).not.toBe('p');
    expect(copy.sites[0]!.rooms.map((r) => r.id)).not.toContain('r1');
    expect(width(ws, copy.sites[0]!.rooms[0]!.id)).toBe(5);
  });

  it('only offers a copy when ids belong to a different local project', () => {
    const file = fileOf(source());
    const other = run(source(), { type: 'project/create', id: 'p2', name: 'Elsewhere' });
    const clashing: ProjectFile = { ...file, project: { ...file.project, id: 'p-new' } };
    expect(previewImport(other, clashing).idClash).toBe(true);
    const r = applyImport(other, clashing, { mode: 'merge', takeIncoming: [] });
    expect(r).toMatchObject({ ok: false, error: { message: 'Some sites or rooms in this file already belong to another project here. Import it as a copy instead.' } });
  });
});

describe('template versions on import', () => {
  it('names templates whose version in the file differs from this browser, instead of dropping them silently', () => {
    const file = fileOf(source());
    const bumped: ProjectFile = { ...file, templates: file.templates.map((t) => (t.id === 'tpl-server-2u' ? { ...t, version: t.version + 2, label: 'Server 2U (site)' } : t)) };
    expect(previewImport(createWorkspace(), bumped).differingTemplates).toEqual(['Server 2U (site)']);
    expect(previewImport(createWorkspace(), file).differingTemplates).toEqual([]);
  });
});
