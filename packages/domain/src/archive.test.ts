import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { approvedRevisionChanges } from './approvals';
import { archiveScope, archiveState, liveCounts } from './archive';
import { exportBackup, parseBackup } from './backup';
import { canonicalJson } from './canonical';
import { apply, type WorkspaceCommand } from './commands/workspace';
import { createWorkspace } from './factories';
import { contentFingerprint } from './fingerprint';
import { currentRevision, findProject, findRoom, findSite } from './lookup';
import type { Workspace } from './model/types';
import { createCopyIds, exportProjectFile, parseProjectFile } from './projectFile';
import { parseWorkspace } from './schema';

const AT = '2026-10-18T09:00:00.000Z';
const LATER = '2026-10-19T09:00:00.000Z';

function run(ws: Workspace, ...cmds: WorkspaceCommand[]): Workspace {
  return cmds.reduce((w, cmd) => {
    const r = apply(w, cmd);
    if (!r.ok) throw new Error(`${cmd.type}: ${r.error.message}`);
    return r.value;
  }, ws);
}
const refused = (ws: Workspace, cmd: WorkspaceCommand): string => {
  const r = apply(ws, cmd);
  if (r.ok) throw new Error(`${cmd.type} was accepted`);
  return r.error.message;
};

/** Northgate: Site A (MDF-1, Server room B), Site B (Edge). */
const seeded = (): Workspace =>
  run(
    createWorkspace(),
    { type: 'project/create', id: 'p', name: 'Northgate' },
    { type: 'site/create', projectId: 'p', id: 's', name: 'Site A' },
    { type: 'site/create', projectId: 'p', id: 's2', name: 'Site B' },
    { type: 'room/create', siteId: 's', id: 'r1', floorAreaId: 'fa-r1', name: 'MDF-1' },
    { type: 'room/create', siteId: 's', id: 'r2', floorAreaId: 'fa-r2', name: 'Server room B' },
    { type: 'room/create', siteId: 's2', id: 'r3', floorAreaId: 'fa-r3', name: 'Edge' },
  );
const archiveRoom = (id: string, by = 'Few'): WorkspaceCommand => ({ type: 'room/archive', roomId: id, by, at: AT });
const archiveSite = (id: string, by = 'Few'): WorkspaceCommand => ({ type: 'site/archive', siteId: id, by, at: AT });
const archiveProject = (id: string, by = 'Few'): WorkspaceCommand => ({ type: 'project/archive', projectId: id, by, at: AT });

describe('archiveState', () => {
  it('is not archived by default, and says nothing for ids that do not exist', () => {
    const ws = seeded();
    expect(archiveState(ws, 'room', 'r1')).toEqual({ archived: false, by: null, source: null });
    expect(archiveState(ws, 'site', 's')).toMatchObject({ archived: false });
    expect(archiveState(ws, 'project', 'p')).toMatchObject({ archived: false });
    expect(archiveState(ws, 'room', 'nope')).toMatchObject({ archived: false, by: null });
  });

  it('says who archived it: the item itself, or the site or project above it', () => {
    const roomWs = run(seeded(), archiveRoom('r1'));
    expect(archiveState(roomWs, 'room', 'r1')).toMatchObject({ archived: true, by: 'self', source: { kind: 'room', id: 'r1', name: 'MDF-1', by: 'Few', at: AT } });
    expect(archiveState(roomWs, 'room', 'r2').archived).toBe(false);
    expect(archiveState(roomWs, 'site', 's').archived).toBe(false);

    const siteWs = run(seeded(), archiveSite('s'));
    expect(archiveState(siteWs, 'site', 's')).toMatchObject({ archived: true, by: 'self' });
    expect(archiveState(siteWs, 'room', 'r1')).toMatchObject({ archived: true, by: 'site', source: { kind: 'site', name: 'Site A' } });
    expect(archiveState(siteWs, 'room', 'r3').archived).toBe(false);

    const projectWs = run(seeded(), archiveProject('p'));
    expect(archiveState(projectWs, 'project', 'p')).toMatchObject({ archived: true, by: 'self' });
    expect(archiveState(projectWs, 'site', 's2')).toMatchObject({ archived: true, by: 'project', source: { kind: 'project', name: 'Northgate' } });
    expect(archiveState(projectWs, 'room', 'r3')).toMatchObject({ archived: true, by: 'project' });
  });

  it('points at the highest archived item, since that is the one to restore first', () => {
    const ws = run(seeded(), archiveRoom('r1'), archiveSite('s'), archiveProject('p'));
    expect(archiveState(ws, 'room', 'r1')).toMatchObject({ by: 'project' });
    expect(archiveState(run(seeded(), archiveRoom('r1'), archiveSite('s')), 'room', 'r1')).toMatchObject({ by: 'site' });
  });

  it('leaves archivedBy out when nobody is named', () => {
    const ws = run(seeded(), archiveRoom('r1', '  '));
    expect(findRoom(ws, 'r1')?.room.archivedAt).toBe(AT);
    expect(findRoom(ws, 'r1')?.room).not.toHaveProperty('archivedBy');
    expect(archiveState(ws, 'room', 'r1').source?.by).toBeNull();
  });
});

describe('archive and restore commands', () => {
  it('stores the stamp only on the item that was archived', () => {
    const ws = run(seeded(), archiveSite('s'));
    expect(findSite(ws, 's')?.site).toMatchObject({ archivedAt: AT, archivedBy: 'Few' });
    expect(findRoom(ws, 'r1')?.room).not.toHaveProperty('archivedAt');
    expect(findProject(ws, 'p')).not.toHaveProperty('archivedAt');
  });

  it('restores each level by removing the stamp', () => {
    const ws = seeded();
    for (const [archive, restore, read] of [
      [archiveRoom('r1'), { type: 'room/restore', roomId: 'r1' }, (w: Workspace) => findRoom(w, 'r1')!.room],
      [archiveSite('s'), { type: 'site/restore', siteId: 's' }, (w: Workspace) => findSite(w, 's')!.site],
      [archiveProject('p'), { type: 'project/restore', projectId: 'p' }, (w: Workspace) => findProject(w, 'p')!],
    ] as const) {
      const archived = run(ws, archive);
      const back = run(archived, restore);
      expect(read(back)).not.toHaveProperty('archivedAt');
      expect(read(back)).not.toHaveProperty('archivedBy');
      expect(canonicalJson(back)).toBe(canonicalJson(ws));
    }
  });

  it('refuses to archive what is already archived, or to archive inside an archived parent', () => {
    const ws = run(seeded(), archiveSite('s'));
    expect(refused(ws, archiveSite('s'))).toBe('Site Site A is already archived.');
    expect(refused(ws, archiveRoom('r1'))).toBe('Room MDF-1 is archived with site Site A.');
    const projectWs = run(seeded(), archiveProject('p'));
    expect(refused(projectWs, archiveSite('s'))).toBe('Site Site A is archived with project Northgate.');
    expect(refused(projectWs, archiveRoom('r3'))).toBe('Room Edge is archived with project Northgate.');
    expect(refused(projectWs, archiveProject('p'))).toBe('Project Northgate is already archived.');
    expect(apply(ws, archiveSite('s'))).toMatchObject({ ok: false, error: { code: 'invalid_value', targets: ['s'] } });
  });

  it('refuses to restore what is not archived, or a child whose parent is still archived', () => {
    expect(refused(seeded(), { type: 'room/restore', roomId: 'r1' })).toBe("Room MDF-1 isn't archived.");
    const siteWs = run(seeded(), archiveRoom('r1'), archiveSite('s'));
    expect(refused(siteWs, { type: 'room/restore', roomId: 'r1' })).toBe('Restore Site Site A first.');
    // A room that is only hidden because its site is archived is told the same.
    expect(refused(siteWs, { type: 'room/restore', roomId: 'r2' })).toBe('Restore Site Site A first.');
    const projectWs = run(seeded(), archiveSite('s2'), archiveProject('p'));
    expect(refused(projectWs, { type: 'site/restore', siteId: 's2' })).toBe('Restore Project Northgate first.');
    expect(refused(projectWs, { type: 'site/restore', siteId: 's' })).toBe('Restore Project Northgate first.');
    const both = run(seeded(), archiveSite('s'), archiveProject('p'));
    expect(refused(both, { type: 'room/restore', roomId: 'r1' })).toBe('Restore Project Northgate first.');
    expect(apply(both, { type: 'room/restore', roomId: 'r1' })).toMatchObject({ ok: false, error: { targets: ['p'] } });
  });

  it('brings a site back with its rooms, except rooms that were archived on their own earlier', () => {
    const ws = run(seeded(), archiveRoom('r1'), archiveSite('s'));
    expect(archiveState(ws, 'room', 'r2').archived).toBe(true);
    const back = run(ws, { type: 'site/restore', siteId: 's' });
    expect(archiveState(back, 'room', 'r2').archived).toBe(false);
    expect(archiveState(back, 'room', 'r1')).toMatchObject({ archived: true, by: 'self' });
    expect(run(back, { type: 'room/restore', roomId: 'r1' })).toSatisfy((w: Workspace) => !archiveState(w, 'room', 'r1').archived);
  });

  it('keeps a site archived on its own when its project is restored', () => {
    const ws = run(seeded(), archiveSite('s'), archiveProject('p'), { type: 'project/restore', projectId: 'p' });
    expect(archiveState(ws, 'site', 's')).toMatchObject({ archived: true, by: 'self' });
    expect(archiveState(ws, 'site', 's2').archived).toBe(false);
  });

  it('keeps a draft and a submitted review exactly as they were, through archive and restore', () => {
    const drafted = run(seeded(), { type: 'plan', roomId: 'r1', command: { type: 'survey/update', patch: { width: 7 } } });
    const submitted = run(drafted, { type: 'review', roomId: 'r2', command: { type: 'review/submit', designedBy: 'Nok', at: AT } });
    const archived = run(submitted, archiveSite('s'));
    expect(currentRevision(findRoom(archived, 'r1')!.room.plan).content.survey.width).toBe(7);
    expect(currentRevision(findRoom(archived, 'r2')!.room.plan).state).toBe('in_review');
    const back = run(archived, { type: 'site/restore', siteId: 's' });
    expect(canonicalJson(back)).toBe(canonicalJson(submitted));
  });

  it('reports what an archive takes with it', () => {
    const ws = run(seeded(), archiveRoom('r1'));
    expect(archiveScope(ws, 'project', 'p')).toEqual({ sites: 2, rooms: 2 });
    expect(archiveScope(ws, 'site', 's')).toEqual({ sites: 0, rooms: 1 });
    expect(archiveScope(ws, 'room', 'r2')).toEqual({ sites: 0, rooms: 0 });
  });

  it('counts only what is still in use', () => {
    expect(liveCounts(seeded())).toEqual({ projects: 1, rooms: 3 });
    expect(liveCounts(run(seeded(), archiveRoom('r1')))).toEqual({ projects: 1, rooms: 2 });
    expect(liveCounts(run(seeded(), archiveSite('s')))).toEqual({ projects: 1, rooms: 1 });
    expect(liveCounts(run(seeded(), archiveProject('p'), { type: 'project/create', id: 'q', name: 'Other' }))).toEqual({ projects: 1, rooms: 0 });
  });

  it('refuses unknown ids and over-long names', () => {
    expect(apply(seeded(), archiveRoom('nope'))).toMatchObject({ ok: false, error: { code: 'not_found' } });
    expect(apply(seeded(), { type: 'site/restore', siteId: 'nope' })).toMatchObject({ ok: false, error: { code: 'not_found' } });
    expect(apply(seeded(), archiveRoom('r1', 'x'.repeat(200))).ok).toBe(false);
  });
});

describe('an archived item is read-only', () => {
  const roomWs = run(seeded(), archiveRoom('r1'));
  const siteWs = run(seeded(), archiveSite('s'));
  const projectWs = run(seeded(), archiveProject('p'));

  it('refuses edits to an archived room, naming it and the way out', () => {
    const msg = 'Room MDF-1 is archived. Restore it to make changes.';
    expect(apply(roomWs, { type: 'room/rename', roomId: 'r1', name: 'X' })).toMatchObject({ ok: false, error: { code: 'archived', message: msg, targets: ['r1'] } });
    expect(refused(roomWs, { type: 'plan', roomId: 'r1', command: { type: 'survey/update', patch: { width: 6 } } })).toBe(msg);
    expect(refused(roomWs, { type: 'review', roomId: 'r1', command: { type: 'review/submit', designedBy: 'Nok', at: AT } })).toBe(msg);
    expect(refused(roomWs, { type: 'review', roomId: 'r1', command: { type: 'note/add', id: 'n', text: 'hi', at: AT } })).toBe(msg);
    expect(refused(roomWs, { type: 'equipment/state', roomId: 'r1', ids: ['d'], state: 'deployed' })).toBe(msg);
    expect(refused(roomWs, { type: 'rack/order', roomId: 'r1', ids: null })).toBe(msg);
    const content = currentRevision(findRoom(roomWs, 'r1')!.room.plan).content;
    expect(refused(roomWs, { type: 'draft/replace', roomId: 'r1', content, expected: content })).toBe(msg);
  });

  it('leaves the rest of the site working', () => {
    expect(apply(roomWs, { type: 'room/rename', roomId: 'r2', name: 'X' }).ok).toBe(true);
    expect(apply(roomWs, { type: 'room/create', siteId: 's', id: 'r9', floorAreaId: 'fa-9', name: 'New' }).ok).toBe(true);
    expect(apply(roomWs, { type: 'plan', roomId: 'r2', command: { type: 'survey/update', patch: { width: 6 } } }).ok).toBe(true);
  });

  it('refuses edits inside an archived site, and says which one to restore', () => {
    const msg = 'Room MDF-1 is archived with site Site A. Restore Site Site A to make changes.';
    expect(refused(siteWs, { type: 'plan', roomId: 'r1', command: { type: 'survey/update', patch: { width: 6 } } })).toBe(msg);
    expect(refused(siteWs, { type: 'room/rename', roomId: 'r1', name: 'X' })).toBe(msg);
    expect(refused(siteWs, { type: 'site/rename', siteId: 's', name: 'X' })).toBe('Site Site A is archived. Restore it to make changes.');
    expect(refused(siteWs, { type: 'room/create', siteId: 's', id: 'r9', floorAreaId: 'fa-9', name: 'New' })).toBe('Site Site A is archived. Restore it to make changes.');
    expect(apply(siteWs, { type: 'plan', roomId: 'r3', command: { type: 'survey/update', patch: { width: 6 } } }).ok).toBe(true);
  });

  it('refuses edits anywhere inside an archived project', () => {
    expect(refused(projectWs, { type: 'project/rename', projectId: 'p', name: 'X' })).toBe('Project Northgate is archived. Restore it to make changes.');
    expect(refused(projectWs, { type: 'site/create', projectId: 'p', id: 's9', name: 'S' })).toBe('Project Northgate is archived. Restore it to make changes.');
    expect(refused(projectWs, { type: 'site/rename', siteId: 's2', name: 'X' })).toBe('Site Site B is archived with project Northgate. Restore Project Northgate to make changes.');
    expect(refused(projectWs, { type: 'plan', roomId: 'r3', command: { type: 'survey/update', patch: { width: 6 } } })).toBe('Room Edge is archived with project Northgate. Restore Project Northgate to make changes.');
  });

  it('still lets other projects, the catalog and backups through', () => {
    const other = run(projectWs, { type: 'project/create', id: 'q', name: 'Other' });
    expect(apply(other, { type: 'project/rename', projectId: 'q', name: 'Renamed' }).ok).toBe(true);
    expect(apply(projectWs, { type: 'backup/mark', at: LATER }).ok).toBe(true);
    expect(apply(projectWs, { type: 'catalog/seed' }).ok).toBe(true);
  });

  it('restoring makes everything editable again', () => {
    const back = run(roomWs, { type: 'room/restore', roomId: 'r1' });
    expect(apply(back, { type: 'plan', roomId: 'r1', command: { type: 'survey/update', patch: { width: 6 } } }).ok).toBe(true);
  });

  it('refuses to delete anything archived, or inside something archived, until it is restored', () => {
    expect(apply(roomWs, { type: 'room/delete', roomId: 'r1' })).toMatchObject({ ok: false, error: { code: 'archived', message: 'Restore Room MDF-1 before deleting it.', targets: ['r1'] } });
    expect(refused(siteWs, { type: 'site/delete', siteId: 's' })).toBe('Restore Site Site A before deleting it.');
    expect(refused(siteWs, { type: 'room/delete', roomId: 'r2' })).toBe('Restore Site Site A before deleting room Server room B.');
    expect(refused(projectWs, { type: 'project/delete', projectId: 'p' })).toBe('Restore Project Northgate before deleting it.');
    expect(refused(projectWs, { type: 'site/delete', siteId: 's2' })).toBe('Restore Project Northgate before deleting site Site B.');
    // What is live still deletes, and restoring first makes it deletable.
    expect(apply(roomWs, { type: 'room/delete', roomId: 'r2' }).ok).toBe(true);
    expect(apply(run(roomWs, { type: 'room/restore', roomId: 'r1' }), { type: 'room/delete', roomId: 'r1' }).ok).toBe(true);
  });

  describe('every command type is either refused on archived work or listed as exempt', () => {
    const live = seeded();
    const file = (() => {
      const exported = exportProjectFile(live, 'p', AT);
      if (!exported.ok) throw new Error(exported.error.message);
      return exported.value;
    })();
    const content = currentRevision(findRoom(live, 'r1')!.room.plan).content;
    // A Record over every command type: adding one fails to compile here until it is placed.
    const aimedAtArchived: Record<WorkspaceCommand['type'], WorkspaceCommand | 'exempt'> = {
      'project/create': 'exempt',
      'project/rename': { type: 'project/rename', projectId: 'p', name: 'X' },
      'project/delete': { type: 'project/delete', projectId: 'p' },
      'site/create': { type: 'site/create', projectId: 'p', id: 's9', name: 'X' },
      'site/rename': { type: 'site/rename', siteId: 's', name: 'X' },
      'site/locate': { type: 'site/locate', siteId: 's', location: { lat: 13.7, lon: 100.5 } },
      'site/delete': { type: 'site/delete', siteId: 's' },
      'room/create': { type: 'room/create', siteId: 's', id: 'r9', floorAreaId: 'fa-9', name: 'X' },
      'room/rename': { type: 'room/rename', roomId: 'r1', name: 'X' },
      'room/delete': { type: 'room/delete', roomId: 'r1' },
      plan: { type: 'plan', roomId: 'r1', command: { type: 'survey/update', patch: { width: 6 } } },
      'draft/replace': { type: 'draft/replace', roomId: 'r1', content, expected: content },
      review: { type: 'review', roomId: 'r1', command: { type: 'note/add', id: 'n', text: 'hi', at: AT } },
      'equipment/state': { type: 'equipment/state', roomId: 'r1', ids: ['d'], state: 'deployed' },
      'rack/order': { type: 'rack/order', roomId: 'r1', ids: null },
      'project/import': { type: 'project/import', file, resolution: { mode: 'merge', takeIncoming: ['r1'] } },
      'project/archive': 'exempt',
      'project/restore': 'exempt',
      'site/archive': 'exempt',
      'site/restore': 'exempt',
      'room/archive': 'exempt',
      'room/restore': 'exempt',
      'backup/mark': 'exempt',
      'sample/load': 'exempt',
      'template/create': 'exempt',
      'template/update': 'exempt',
      'template/delete': 'exempt',
      'catalog/seed': 'exempt',
      'catalog/import': 'exempt',
    };
    // Everything archived at once: project p (so sites s, s2 and rooms r1..r3 are inside it).
    const archivedAll = run(seeded(), archiveProject('p'));

    for (const [type, command] of Object.entries(aimedAtArchived)) {
      if (command === 'exempt') continue;
      it(`${type} is refused`, () => {
        expect(apply(archivedAll, command)).toMatchObject({ ok: false, error: { code: 'archived' } });
      });
    }

    it('keeps the exempt list to what is not an edit of anything archived', () => {
      const exempt = Object.entries(aimedAtArchived).filter(([, v]) => v === 'exempt').map(([k]) => k);
      expect(exempt.sort()).toEqual(['backup/mark', 'catalog/import', 'catalog/seed', 'project/archive', 'project/create', 'project/restore', 'room/archive', 'room/restore', 'sample/load', 'site/archive', 'site/restore', 'template/create', 'template/delete', 'template/update']);
    });
  });

  describe('importing a project file over archived work', () => {
    const fileOf = (ws: Workspace) => {
      const exported = exportProjectFile(ws, 'p', AT);
      if (!exported.ok) throw new Error(exported.error.message);
      const parsed = parseProjectFile(JSON.parse(JSON.stringify(exported.value)));
      if (!parsed.ok) throw new Error(parsed.error.message);
      return parsed.value;
    };
    const live = seeded();
    const withNewRoom = run(live, { type: 'room/create', siteId: 's', id: 'r9', floorAreaId: 'fa-9', name: 'Added later' });

    it('refuses a merge into an archived project, or one that adds to an archived site or replaces an archived room', () => {
      expect(refused(projectWs, { type: 'project/import', file: fileOf(live), resolution: { mode: 'merge', takeIncoming: [] } })).toBe('Project Northgate is archived. Restore it to import into it.');
      expect(refused(siteWs, { type: 'project/import', file: fileOf(withNewRoom), resolution: { mode: 'merge', takeIncoming: [] } })).toBe('Site Site A is archived. Restore it to import into it.');
      expect(refused(roomWs, { type: 'project/import', file: fileOf(live), resolution: { mode: 'merge', takeIncoming: ['r1'] } })).toBe('Room MDF-1 is archived. Restore it to import into it.');
    });

    it('lets a merge through that leaves the archived parts alone, and a copy always', () => {
      expect(apply(siteWs, { type: 'project/import', file: fileOf(live), resolution: { mode: 'merge', takeIncoming: ['r3'] } }).ok).toBe(true);
      const file = fileOf(live);
      expect(apply(projectWs, { type: 'project/import', file, resolution: { mode: 'copy', ids: createCopyIds(file) } }).ok).toBe(true);
    });

    const stamped = (ws: Workspace) => fileOf(run(ws, archiveRoom('r2'), archiveSite('s2'), archiveProject('p')));
    const noneArchived = (ws: Workspace) => ws.projects.every((p) => p.archivedAt === undefined && p.sites.every((s) => s.archivedAt === undefined && s.rooms.every((r) => r.archivedAt === undefined)));

    it('never archives anything by merge: a file’s stamps are dropped, for existing and for new projects', () => {
      const file = stamped(live);
      expect(file.project.archivedAt).toBe(AT);
      const merged = run(live, { type: 'project/import', file, resolution: { mode: 'merge', takeIncoming: ['r1', 'r2', 'r3'] } });
      expect(noneArchived(merged)).toBe(true);
      const fresh = run(createWorkspace(), { type: 'project/import', file, resolution: { mode: 'merge', takeIncoming: [] } });
      expect(fresh.projects).toHaveLength(1);
      expect(noneArchived(fresh)).toBe(true);
    });

    it('keeps local stamps when a merge touches other parts', () => {
      const local = run(live, archiveSite('s2'));
      const merged = run(local, { type: 'project/import', file: fileOf(withNewRoom), resolution: { mode: 'merge', takeIncoming: [] } });
      expect(archiveState(merged, 'site', 's2')).toMatchObject({ archived: true, by: 'self' });
      expect(findRoom(merged, 'r9')).toBeTruthy();
    });

    it('starts a copy active, whatever the file carries', () => {
      const file = stamped(live);
      const copy = run(live, { type: 'project/import', file, resolution: { mode: 'copy', ids: createCopyIds(file) } });
      expect(noneArchived(copy)).toBe(true);
      expect(copy.projects).toHaveLength(2);
    });
  });
});

describe('saving and loading', () => {
  it('round-trips archived items through the workspace schema, a backup and a project file', () => {
    const ws = run(seeded(), archiveRoom('r1'), archiveSite('s2', 'Nok'));
    const parsed = parseWorkspace(JSON.parse(JSON.stringify(ws)));
    expect(parsed.ok && canonicalJson(parsed.value)).toBe(canonicalJson(ws));

    const backup = parseBackup(JSON.parse(JSON.stringify(exportBackup(ws, LATER))));
    expect(backup.ok && archiveState(backup.value, 'room', 'r1')).toMatchObject({ archived: true, by: 'self' });
    expect(backup.ok && archiveState(backup.value, 'room', 'r3')).toMatchObject({ archived: true, by: 'site' });

    const exported = exportProjectFile(ws, 'p', LATER);
    expect(exported.ok).toBe(true);
    const file = exported.ok ? parseProjectFile(JSON.parse(JSON.stringify(exported.value))) : null;
    expect(file?.ok && file.value.project.sites[1]).toMatchObject({ archivedAt: AT, archivedBy: 'Nok' });
  });

  it('exports an archived project as a file all the same', () => {
    expect(exportProjectFile(run(seeded(), archiveProject('p')), 'p', LATER).ok).toBe(true);
  });

  it('loads a workspace saved before archiving existed, with nothing archived', () => {
    const old = JSON.parse(JSON.stringify(seeded())) as Workspace;
    const parsed = parseWorkspace(old);
    expect(parsed.ok).toBe(true);
    expect(parsed.ok && archiveState(parsed.value, 'room', 'r1').archived).toBe(false);
  });

  it('rejects an archive stamp that is not a string', () => {
    const bad = produce(seeded(), (d) => void ((d.projects[0] as unknown as Record<string, unknown>).archivedAt = 5));
    expect(parseWorkspace(bad).ok).toBe(false);
  });
});

describe('approval fingerprints', () => {
  // A workspace exactly as it was saved before archiving existed: an approved revision with its stored hash, and no archive fields.
  // The hash is what contentFingerprint produced on the code before archiving, so it must never move.
  const STORED_HASH = '1d7915b1997ee527bd4900217ef202ab5e22712912c16694afd79cffb7144cbc';
  const oldWorkspace = (): unknown => {
    const raw = JSON.parse(JSON.stringify(seeded())) as Workspace;
    const rev = raw.projects[0]!.sites[0]!.rooms[0]!.plan.revisions[0]!;
    rev.state = 'approved';
    rev.approvedHash = STORED_HASH;
    rev.approvedAt = '2026-10-01T00:00:00.000Z';
    rev.approvedBy = { name: 'Nok', at: '2026-10-01T00:00:00.000Z' };
    rev.submittedAt = '2026-10-01T00:00:00.000Z';
    return raw;
  };

  it('keeps an old approved revision byte-identical, and matching its stored hash, through load, archive and restore', () => {
    const loaded = parseWorkspace(oldWorkspace());
    if (!loaded.ok) throw new Error(loaded.error.message);
    const before = currentRevision(findRoom(loaded.value, 'r1')!.room.plan);
    expect(contentFingerprint(before.content)).toBe(STORED_HASH);
    const archived = run(loaded.value, archiveRoom('r1'), archiveSite('s'), archiveProject('p'));
    const during = currentRevision(findRoom(archived, 'r1')!.room.plan);
    expect(canonicalJson(during)).toBe(canonicalJson(before));
    expect(approvedRevisionChanges(loaded.value, archived)).toEqual([]);
    const restored = run(archived, { type: 'project/restore', projectId: 'p' }, { type: 'site/restore', siteId: 's' }, { type: 'room/restore', roomId: 'r1' });
    const after = currentRevision(findRoom(restored, 'r1')!.room.plan);
    expect(contentFingerprint(after.content)).toBe(STORED_HASH);
    expect(after.approvedHash).toBe(STORED_HASH);
    expect(canonicalJson(restored)).toBe(canonicalJson(loaded.value));
  });
});
