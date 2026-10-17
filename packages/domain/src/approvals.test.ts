import { describe, expect, it } from 'vitest';
import { approvedRevisionChanges } from './approvals';
import { apply, type WorkspaceCommand } from './commands/workspace';
import { createWorkspace } from './factories';
import { findRoom } from './lookup';
import type { Rack, Template, Workspace } from './model/types';
import { createObject } from './objects';

const rack = { ...(createObject('rack', { x: 1, y: 0.6 }, []) as Rack), id: 'rk', name: 'RK-01' };

/** Applies commands and fails the test on the first refusal. */
function run(ws: Workspace, commands: WorkspaceCommand[]): Workspace {
  return commands.reduce((acc, c) => {
    const r = apply(acc, c);
    if (!r.ok) throw new Error(`setup failed at ${c.type}: ${r.error.message}`);
    return r.value;
  }, ws);
}

function approvedWs(): Workspace {
  const base = run(createWorkspace(), [
    { type: 'project/create', id: 'p', name: 'P' },
    { type: 'site/create', projectId: 'p', id: 's', name: 'S' },
    { type: 'room/create', siteId: 's', id: 'r', floorAreaId: 'fa-r', name: 'MDF-1' },
    { type: 'plan', roomId: 'r', command: { type: 'object/add', object: rack } },
  ]);
  const template = base.catalog.find((x) => x.id === 'tpl-server-2u') as Template;
  return run(base, [
    { type: 'plan', roomId: 'r', command: { type: 'device/place', id: 'srv', rackId: 'rk', bottomU: 1, template } },
    { type: 'review', roomId: 'r', command: { type: 'review/submit', designedBy: 'Eddie', at: 't1' } },
    { type: 'review', roomId: 'r', command: { type: 'review/approve', reviewer: 'Rae', at: 't2' } },
  ]);
}

const firstRevision = (ws: Workspace) => ws.projects[0]!.sites[0]!.rooms[0]!.plan.revisions[0]!;

describe('approvedRevisionChanges', () => {
  it('finds nothing when an approved revision is untouched (new draft and edits are fine)', () => {
    const before = approvedWs();
    const after = run(before, [
      { type: 'review', roomId: 'r', command: { type: 'review/new-draft', at: 't3' } },
      { type: 'room/rename', roomId: 'r', name: 'MDF-2' },
    ]);
    expect(approvedRevisionChanges(before, after)).toEqual([]);
  });

  it('reports an approved revision whose content changed', () => {
    const before = approvedWs();
    const after = structuredClone(before);
    firstRevision(after).content.vlans.push({ vid: 99, name: 'x' });
    expect(approvedRevisionChanges(before, after)).toEqual([{ roomId: 'r', roomName: 'MDF-1', revision: 1 }]);
  });

  it('reports an approved revision that disappeared while its room still exists', () => {
    const before = approvedWs();
    const after = structuredClone(before);
    after.projects[0]!.sites[0]!.rooms[0]!.plan.revisions = [{ ...firstRevision(after), number: 2 }];
    expect(approvedRevisionChanges(before, after)).toHaveLength(1);
  });

  it('allows deleting the whole room (the role matrix decides that, the approval record stays on the server)', () => {
    const before = approvedWs();
    const after = run(before, [{ type: 'room/delete', roomId: 'r' }]);
    expect(findRoom(after, 'r')).toBeNull();
    expect(approvedRevisionChanges(before, after)).toEqual([]);
  });

  it('reports a changed approver even when content is equal', () => {
    const before = approvedWs();
    const after = structuredClone(before);
    firstRevision(after).approvedBy = { name: 'Someone', at: 't2' };
    expect(approvedRevisionChanges(before, after)).toHaveLength(1);
  });
});
