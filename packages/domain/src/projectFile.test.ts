import { describe, expect, it } from 'vitest';
import { apply, type WorkspaceCommand } from './commands/workspace';
import { createWorkspace } from './factories';
import { currentRevision, findRoom } from './lookup';
import type { Rack, Template, Workspace } from './model/types';
import { createObject } from './objects';
import { isSelfApproved } from './readiness';
import { newlyApprovedRevisions } from './approvals';
import { applyImport, createCopyIds, exportProjectFile, parseProjectFile, previewImport, type ImportResolution, type ProjectFile } from './projectFile';

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
    { type: 'room/create', siteId: 's', id: 'r1', floorAreaId: 'fa-r1', name: 'MDF-1' },
    { type: 'room/create', siteId: 's', id: 'r2', floorAreaId: 'fa-r2', name: 'Server room B' },
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
function applyOk(ws: Workspace, file: ProjectFile, resolution: ImportResolution): Workspace {
  const r = applyImport(ws, file, resolution);
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
}
const width = (ws: Workspace, roomId: string) => currentRevision(findRoom(ws, roomId)!.room.plan).content.survey.width;

describe('project file', () => {
  it('exports the project with every revision and the template versions it uses', () => {
    const file = fileOf(source());
    expect(file).toMatchObject({ format: 'glasshouse.project', schemaVersion: 9, exportedAt: AT, project: { id: 'p', name: 'Northgate' } });
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
    const ws = run(local, { type: 'project/import', file: fileOf(local), resolution: { mode: 'copy', ids: createCopyIds(fileOf(local)) } });
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

  it('refuses a merge that would put the same room in two sites', () => {
    const local = run(source(), { type: 'site/create', projectId: 'p', id: 'sb', name: 'Site B' });
    const file = fileOf(local);
    const [siteA, siteB] = file.project.sites;
    const moved = siteA!.rooms.find((r) => r.id === 'r1')!;
    const movedFile: ProjectFile = {
      ...file,
      project: {
        ...file.project,
        sites: [{ ...siteA!, rooms: siteA!.rooms.filter((r) => r.id !== 'r1') }, { ...siteB!, rooms: [moved] }],
      },
    };
    const result = applyImport(local, movedFile, { mode: 'merge', takeIncoming: [] });
    expect(result).toMatchObject({ ok: false, error: { code: 'invalid_value', targets: ['r1'] } });
  });
});

describe('template versions on import', () => {
  it('names templates whose version in the file differs from this browser, instead of dropping them silently', () => {
    const file = fileOf(source());
    const bumped: ProjectFile = { ...file, templates: file.templates.map((t) => (t.id === 'tpl-server-2u' ? { ...t, version: t.version + 2, label: 'Server 2U (site)' } : t)) };
    expect(previewImport(createWorkspace(), bumped).differingTemplates).toEqual(['Server 2U (site)']);
    expect(previewImport(createWorkspace(), file).differingTemplates).toEqual([]);
  });

  describe('people in an imported file are never verified', () => {
    const signedFile = (): ProjectFile => {
      const ws = run(
        source(),
        { type: 'review', roomId: 'r1', command: { type: 'review/submit', designedBy: 'Dana', at: AT, byId: 'u-dana' } },
        { type: 'review', roomId: 'r1', command: { type: 'note/add', id: 'n1', text: 'check the PDU', at: AT, by: 'Dana', byId: 'u-dana' } },
        { type: 'review', roomId: 'r1', command: { type: 'review/approve', reviewer: 'Ada', at: AT, byId: 'u-ada' } },
      );
      const file = fileOf(ws);
      const ack = { reservedRangeId: 'rr', reason: 'known', by: { name: 'Dana', at: AT, userId: 'u-dana' } };
      return {
        ...file,
        project: { ...file.project, sites: file.project.sites.map((s) => ({ ...s, rooms: s.rooms.map((r) => ({ ...r, plan: { ...r.plan, revisions: r.plan.revisions.map((v) => ({ ...v, acknowledgements: [ack] })) } })) })) },
      };
    };
    const firstPlan = (ws: Workspace, id = 'r1') => findRoom(ws, id)!.room.plan;
    const resolutions = (file: ProjectFile): Record<string, ImportResolution> => ({
      new: { mode: 'merge', takeIncoming: [] },
      copy: { mode: 'copy', ids: createCopyIds(file) },
    });

    it.each(['new', 'copy'])('strips user ids from revisions, acknowledgements, notes and history (%s)', (kind) => {
      const file = signedFile();
      const ws = applyOk(createWorkspace(), file, resolutions(file)[kind]!);
      const room = ws.projects.flatMap((p) => p.sites.flatMap((s) => s.rooms))[0]!;
      const rev = room.plan.revisions[0]!;
      expect(rev.designedBy).toEqual({ name: 'Dana', at: AT });
      expect(rev.approvedBy).toEqual({ name: 'Ada', at: AT });
      expect(rev.acknowledgements[0]!.by).toEqual({ name: 'Dana', at: AT });
      expect(room.plan.notes[0]).not.toHaveProperty('byId');
      expect(room.plan.notes[0]!.by).toBe('Dana');
      expect(room.plan.history.length).toBeGreaterThan(0);
      for (const e of room.plan.history) { expect(e.params ?? {}).not.toHaveProperty('verified'); expect(e.params ?? {}).not.toHaveProperty('byId'); }
      expect(JSON.stringify(ws)).not.toMatch(/u-dana|u-ada/);
    });

    it('strips ids from incoming rooms taken in a merge, and leaves local rooms alone', () => {
      const file = signedFile();
      const local = run(source(), { type: 'review', roomId: 'r2', command: { type: 'review/submit', designedBy: 'Lee', at: AT, byId: 'u-lee' } });
      const ws = applyOk(local, file, { mode: 'merge', takeIncoming: ['r1'] });
      expect(firstPlan(ws).revisions[0]!.designedBy).toEqual({ name: 'Dana', at: AT });
      expect(firstPlan(ws, 'r2').revisions[0]!.designedBy).toEqual({ name: 'Lee', at: AT, userId: 'u-lee' });
    });

    it('does not let a reviewer launder self-approval through an imported in_review revision', () => {
      const file = signedFile();
      const inReview = {
        ...file,
        project: { ...file.project, sites: file.project.sites.map((s) => ({ ...s, rooms: s.rooms.map((r) => ({ ...r, plan: { ...r.plan, revisions: r.plan.revisions.map((v) => ({ ...v, state: 'in_review' as const, approvedBy: null, approvedAt: null })) } })) })) },
      };
      const ws = applyOk(createWorkspace(), inReview, { mode: 'merge', takeIncoming: [] });
      const approved = run(ws, { type: 'review', roomId: 'r1', command: { type: 'review/approve', reviewer: 'Dana', at: AT, byId: 'u-dana' } });
      const rev = firstPlan(approved).revisions[0]!;
      expect(rev.designedBy?.userId).toBeUndefined();
      expect(rev.approvedBy?.userId).toBe('u-dana');
      expect(isSelfApproved(rev)).toBe(true);
    });
  });
});

describe('imports cannot create approvals', () => {
  const approvedSource = (): Workspace =>
    run(
      source(),
      { type: 'review', roomId: 'r1', command: { type: 'review/submit', designedBy: 'Dana', at: AT } },
      { type: 'review', roomId: 'r1', command: { type: 'review/approve', reviewer: 'Ada', at: AT } },
    );
  const revisionsOf = (ws: Workspace, roomId = 'r1') => findRoom(ws, roomId)!.room.plan.revisions;
  const mapRevisions = (file: ProjectFile, f: (r: ProjectFile['project']['sites'][number]['rooms'][number]['plan']['revisions'][number]) => ProjectFile['project']['sites'][number]['rooms'][number]['plan']['revisions'][number]): ProjectFile => ({
    ...file,
    project: { ...file.project, sites: file.project.sites.map((s) => ({ ...s, rooms: s.rooms.map((r) => ({ ...r, plan: { ...r.plan, revisions: r.plan.revisions.map(f) } })) })) },
  });
  const resolutionsFor = (file: ProjectFile): ImportResolution[] => [{ mode: 'merge', takeIncoming: [] }, { mode: 'copy', ids: createCopyIds(file) }];

  it('keeps the approval hash of a file whose approved content is untouched', () => {
    const file = fileOf(approvedSource());
    expect(revisionsOf(approvedSource())[0]!.approvedHash).toBeDefined();
    for (const resolution of resolutionsFor(file)) {
      const ws = applyOk(createWorkspace(), file, resolution);
      const rev = ws.projects[0]!.sites[0]!.rooms.find((r) => r.name === 'MDF-1')!.plan.revisions[0]!;
      expect(rev.state).toBe('approved');
      expect(rev.approvedHash).toBe(file.project.sites[0]!.rooms[0]!.plan.revisions[0]!.approvedHash);
    }
  });

  it('drops an approval hash that does not match the content, in every mode', () => {
    const file = mapRevisions(fileOf(approvedSource()), (v) => ({ ...v, content: { ...v.content, survey: { ...v.content.survey, width: v.content.survey.width + 1 } } }));
    for (const resolution of resolutionsFor(file)) {
      const ws = applyOk(createWorkspace(), file, resolution);
      const rev = ws.projects[0]!.sites[0]!.rooms.find((r) => r.name === 'MDF-1')!.plan.revisions[0]!;
      expect(rev.approvedHash).toBeUndefined();
    }
  });

  it('drops a made-up approval hash on a non-approved revision', () => {
    const file = mapRevisions(fileOf(source()), (v) => ({ ...v, approvedHash: 'a'.repeat(64) }));
    const ws = applyOk(createWorkspace(), file, { mode: 'merge', takeIncoming: [] });
    expect(ws.projects[0]!.sites[0]!.rooms[0]!.plan.revisions[0]!.approvedHash).toBeUndefined();
  });
});

describe('newlyApprovedRevisions', () => {
  const approvedFile = () =>
    fileOf(
      run(
        source(),
        { type: 'review', roomId: 'r1', command: { type: 'review/submit', designedBy: 'Dana', at: AT } },
        { type: 'review', roomId: 'r1', command: { type: 'review/approve', reviewer: 'Ada', at: AT } },
      ),
    );

  it('finds an in-review room that a merge would turn approved', () => {
    const local = run(source(), { type: 'review', roomId: 'r1', command: { type: 'review/submit', designedBy: 'Dana', at: AT } });
    const after = applyOk(local, approvedFile(), { mode: 'merge', takeIncoming: ['r1'] });
    expect(newlyApprovedRevisions(local, after)).toEqual([{ roomId: 'r1', roomName: 'MDF-1', revision: 1 }]);
  });

  it('finds a draft turned approved by take-incoming', () => {
    const after = applyOk(source(), approvedFile(), { mode: 'merge', takeIncoming: ['r1'] });
    expect(newlyApprovedRevisions(source(), after)).toEqual([{ roomId: 'r1', roomName: 'MDF-1', revision: 1 }]);
  });

  it('finds an approved revision added on top of a server room', () => {
    const file = approvedFile();
    const withNext = { ...file, project: { ...file.project, sites: file.project.sites.map((s) => ({ ...s, rooms: s.rooms.map((r) => (r.id === 'r1' ? { ...r, plan: { ...r.plan, revisions: [...r.plan.revisions, { ...r.plan.revisions[0]!, number: 2 }] } } : r)) })) } };
    const local = approvedFileWorkspace();
    const after = applyOk(local, withNext, { mode: 'merge', takeIncoming: ['r1'] });
    expect(newlyApprovedRevisions(local, after)).toEqual([{ roomId: 'r1', roomName: 'MDF-1', revision: 2 }]);
  });

  it('ignores rooms that are new on the server and approvals that were already there', () => {
    const file = approvedFile();
    expect(newlyApprovedRevisions(createWorkspace(), applyOk(createWorkspace(), file, { mode: 'merge', takeIncoming: [] }))).toEqual([]);
    const local = approvedFileWorkspace();
    expect(newlyApprovedRevisions(local, local)).toEqual([]);
  });
});

function approvedFileWorkspace(): Workspace {
  return run(
    source(),
    { type: 'review', roomId: 'r1', command: { type: 'review/submit', designedBy: 'Dana', at: AT } },
    { type: 'review', roomId: 'r1', command: { type: 'review/approve', reviewer: 'Ada', at: AT } },
  );
}
