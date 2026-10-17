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

describe('replaceDraftContent', () => {
  it('swaps a room draft content (used by undo) and refuses frozen revisions', async () => {
    const { replaceDraftContent } = await import('./workspace');
    const ws = seeded();
    const before = currentRevision(findRoom(ws, 'r')!.room.plan).content;
    const edited = run(ws, { type: 'plan', roomId: 'r', command: { type: 'survey/update', patch: { width: 9 } } });
    const restored = replaceDraftContent(edited, 'r', before);
    expect(restored.ok && currentRevision(findRoom(restored.value, 'r')!.room.plan).content.survey.width).toBe(5);
    const frozen = produce(edited, (d) => void (d.projects[0]!.sites[0]!.rooms[0]!.plan.revisions[0]!.state = 'approved'));
    expect(replaceDraftContent(frozen, 'r', before)).toMatchObject({ ok: false, error: { code: 'not_draft' } });
    expect(replaceDraftContent(ws, 'nope', before).ok).toBe(false);
  });
});

describe('stored text ceiling', () => {
  it('refuses any command carrying text over the stored limit, wherever it sits', async () => {
    const { LIMITS } = await import('../model/defaults');
    const huge = 'x'.repeat(LIMITS.storedTextMaxLength + 1);
    expect(apply(seeded(), { type: 'project/create', id: 'q', name: huge })).toMatchObject({ ok: false, error: { code: 'invalid_value' } });
    const nested = { type: 'plan', roomId: 'r', command: { type: 'survey/update', patch: { notes: huge } } } as WorkspaceCommand;
    expect(apply(seeded(), nested)).toMatchObject({ ok: false, error: { message: expect.stringContaining('10,000') } });
  });

  it('rejects a stored workspace with over-long text instead of loading it', async () => {
    const { LIMITS } = await import('../model/defaults');
    const { parseWorkspace } = await import('../schema');
    const ws = seeded();
    const bloated = produce(ws, (d) => void (d.projects[0]!.notes = 'x'.repeat(LIMITS.storedTextMaxLength + 1)));
    expect(parseWorkspace(bloated).ok).toBe(false);
    expect(parseWorkspace(ws).ok).toBe(true);
  });
});

describe('draft/replace', () => {
  it('restores a draft only while it still matches what the user saw', () => {
    const ws = seeded();
    const before = currentRevision(findRoom(ws, 'r')!.room.plan).content;
    const edited = run(ws, { type: 'plan', roomId: 'r', command: { type: 'survey/update', patch: { width: 9 } } });
    const seen = currentRevision(findRoom(edited, 'r')!.room.plan).content;
    const undone = apply(edited, { type: 'draft/replace', roomId: 'r', content: before, expected: seen });
    expect(undone.ok && currentRevision(findRoom(undone.value, 'r')!.room.plan).content.survey.width).toBe(5);
    // Someone else widened it again: the old "seen" content no longer matches.
    const changedAgain = run(edited, { type: 'plan', roomId: 'r', command: { type: 'survey/update', patch: { width: 11 } } });
    expect(apply(changedAgain, { type: 'draft/replace', roomId: 'r', content: before, expected: seen })).toMatchObject({ ok: false, error: { code: 'stale', targets: ['r'] } });
    expect(apply(edited, { type: 'draft/replace', roomId: 'nope', content: before, expected: seen })).toMatchObject({ ok: false, error: { code: 'not_found' } });
  });
});
