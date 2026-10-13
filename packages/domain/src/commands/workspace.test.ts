import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { createWorkspace } from '../factories';
import { currentRevision, findRoom } from '../lookup';
import type { Workspace } from '../model/types';
import { apply, type WorkspaceCommand } from './workspace';

function run(ws: Workspace, ...cmds: WorkspaceCommand[]): Workspace {
  return cmds.reduce((w, cmd) => {
    const r = apply(w, cmd);
    if (!r.ok) throw new Error(r.error.message);
    return r.value;
  }, ws);
}

const seeded = (): Workspace =>
  run(
    createWorkspace(),
    { type: 'project/create', id: 'p', name: '  Northgate ' },
    { type: 'site/create', projectId: 'p', id: 's', name: 'Site A' },
    { type: 'room/create', siteId: 's', id: 'r', name: 'MDF-1' },
  );

describe('hierarchy', () => {
  it('creates Project → Site → Room with a draft plan', () => {
    const ws = seeded();
    const loc = findRoom(ws, 'r');
    expect(loc?.project.name).toBe('Northgate');
    expect(loc?.site.name).toBe('Site A');
    expect(currentRevision(loc!.room.plan)).toMatchObject({ number: 1, state: 'draft' });
  });

  it('renames each level', () => {
    const ws = run(
      seeded(),
      { type: 'project/rename', projectId: 'p', name: 'Northgate Logistics' },
      { type: 'site/rename', siteId: 's', name: 'Warehouse 2' },
      { type: 'room/rename', roomId: 'r', name: 'MDF-2' },
    );
    expect(findRoom(ws, 'r')).toMatchObject({ project: { name: 'Northgate Logistics' }, site: { name: 'Warehouse 2' }, room: { name: 'MDF-2' } });
  });

  it('deletes with cascade', () => {
    expect(findRoom(run(seeded(), { type: 'room/delete', roomId: 'r' }), 'r')).toBeNull();
    expect(run(seeded(), { type: 'site/delete', siteId: 's' }).projects[0]?.sites).toEqual([]);
    expect(run(seeded(), { type: 'project/delete', projectId: 'p' }).projects).toEqual([]);
  });

  it('rejects empty names, duplicate ids and unknown parents', () => {
    const ws = seeded();
    expect(apply(ws, { type: 'project/create', id: 'q', name: '' })).toMatchObject({ ok: false, error: { message: "Project name can't be empty." } });
    expect(apply(ws, { type: 'project/create', id: 'p', name: 'Again' }).ok).toBe(false);
    expect(apply(ws, { type: 'site/create', projectId: 'nope', id: 'x', name: 'S' })).toMatchObject({ ok: false, error: { code: 'not_found' } });
    expect(apply(ws, { type: 'room/create', siteId: 'nope', id: 'x', name: 'R' }).ok).toBe(false);
    expect(apply(ws, { type: 'room/rename', roomId: 'nope', name: 'R' }).ok).toBe(false);
    expect(apply(ws, { type: 'site/delete', siteId: 'nope' }).ok).toBe(false);
  });
});

describe('plan routing', () => {
  it('applies plan commands to the draft revision only', () => {
    const ws = run(seeded(), { type: 'plan', roomId: 'r', command: { type: 'survey/update', patch: { width: 6 } } });
    expect(currentRevision(findRoom(ws, 'r')!.room.plan).content.survey.width).toBe(6);
  });

  it('refuses edits to a frozen revision', () => {
    const frozen = produce(seeded(), (d) => {
      const rev = d.projects[0]!.sites[0]!.rooms[0]!.plan.revisions[0]!;
      rev.state = 'in_review';
    });
    expect(apply(frozen, { type: 'plan', roomId: 'r', command: { type: 'survey/update', patch: { width: 6 } } })).toMatchObject({
      ok: false,
      error: { code: 'not_draft', message: 'Revision 1 is frozen. Start a new draft to edit it.' },
    });
  });

  it('passes plan errors through and never mutates the input', () => {
    const ws = seeded();
    const before = JSON.parse(JSON.stringify(ws)) as typeof ws;
    expect(apply(ws, { type: 'plan', roomId: 'r', command: { type: 'survey/update', patch: { width: 0 } } }).ok).toBe(false);
    expect(apply(ws, { type: 'plan', roomId: 'nope', command: { type: 'survey/update', patch: {} } }).ok).toBe(false);
    run(ws, { type: 'plan', roomId: 'r', command: { type: 'survey/update', patch: { width: 7 } } });
    expect(ws).toEqual(before);
  });
});
