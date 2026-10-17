import { describe, expect, it } from 'vitest';
import { known, unknownDemand } from '../demand';
import { findReserved } from '../devices';
import { createWorkspace } from '../factories';
import { currentRevision, findRoom } from '../lookup';
import type { Rack, Template, Workspace } from '../model/types';
import { createObject } from '../objects';
import { approvalBlockers, isSelfApproved } from '../readiness';
import { apply, type WorkspaceCommand } from './workspace';

const AT = '2026-10-14T09:00:00.000Z';
const rack = { ...(createObject('rack', { x: 1, y: 0.6 }, []) as Rack), id: 'rk', name: 'RK-01' };

function run(ws: Workspace, ...cmds: WorkspaceCommand[]): Workspace {
  return cmds.reduce((w, cmd) => {
    const r = apply(w, cmd);
    if (!r.ok) throw new Error(r.error.message);
    return r.value;
  }, ws);
}
const fail = (ws: Workspace, cmd: WorkspaceCommand): string => {
  const r = apply(ws, cmd);
  if (r.ok) throw new Error('expected a rejection');
  return r.error.message;
};
const plan = (ws: Workspace) => findRoom(ws, 'r')!.room.plan;
const review = (command: Extract<WorkspaceCommand, { type: 'review' }>['command']): WorkspaceCommand => ({ type: 'review', roomId: 'r', command });

function ready(withDevice = true): Workspace {
  let ws = run(
    createWorkspace(),
    { type: 'project/create', id: 'p', name: 'P' },
    { type: 'site/create', projectId: 'p', id: 's', name: 'S' },
    { type: 'room/create', siteId: 's', id: 'r', floorAreaId: 'fa-r', name: 'MDF-1' },
    { type: 'plan', roomId: 'r', command: { type: 'object/add', object: rack } },
  );
  if (withDevice) {
    const t = ws.catalog.find((x) => x.id === 'tpl-server-2u') as Template;
    ws = run(ws, { type: 'plan', roomId: 'r', command: { type: 'device/place', id: 'srv', rackId: 'rk', bottomU: 1, template: t } });
  }
  return ws;
}

describe('lifecycle', () => {
  it('AC13: submit freezes, approve records the reviewer, a new draft never touches the snapshot', () => {
    let ws = run(ready(), review({ type: 'review/submit', designedBy: ' Ploy ', at: AT }));
    expect(currentRevision(plan(ws))).toMatchObject({ number: 1, state: 'in_review', designedBy: { name: 'Ploy' }, submittedAt: AT });
    expect(fail(ws, { type: 'plan', roomId: 'r', command: { type: 'survey/update', patch: { width: 8 } } })).toBe('Revision 1 is frozen. Start a new draft to edit it.');
    ws = run(ws, review({ type: 'review/approve', reviewer: 'Somchai', at: AT }));
    const approved = currentRevision(plan(ws));
    expect(approved).toMatchObject({ state: 'approved', approvedBy: { name: 'Somchai' }, approvedAt: AT });
    ws = run(ws, review({ type: 'review/new-draft', at: AT }), { type: 'plan', roomId: 'r', command: { type: 'survey/update', patch: { width: 8 } } });
    expect(plan(ws).revisions.map((r) => [r.number, r.state, r.content.survey.width])).toEqual([
      [1, 'approved', 5],
      [2, 'draft', 8],
    ]);
    expect(plan(ws).revisions[0]).toBe(approved);
    expect(plan(ws).history.map((h) => h.action)).toEqual([
      'Submitted for review by Ploy (unverified)',
      'Approved by Somchai (unverified)',
      'Started Draft revision 2 from revision 1',
    ]);
  });

  it('enforces the order of steps', () => {
    const ws = ready();
    expect(fail(ws, review({ type: 'review/approve', reviewer: 'S', at: AT }))).toBe('Submit the Draft for review before approving it.');
    expect(fail(ws, review({ type: 'review/new-draft', at: AT }))).toBe('Revision 1 is already a Draft.');
    const submitted = run(ws, review({ type: 'review/submit', designedBy: '', at: AT }));
    expect(currentRevision(plan(submitted)).designedBy).toBeNull();
    expect(fail(submitted, review({ type: 'review/submit', designedBy: '', at: AT }))).toBe('Revision 1 is already In review.');
    expect(fail(submitted, review({ type: 'review/approve', reviewer: ' ', at: AT }))).toBe("Reviewer's name can't be empty.");
    expect(run(submitted, review({ type: 'review/new-draft', at: AT })).projects[0]!.sites[0]!.rooms[0]!.plan.revisions).toHaveLength(2);
  });

  it('AC16: self-approval is allowed and flagged', () => {
    const ws = run(ready(), review({ type: 'review/submit', designedBy: 'Ploy', at: AT }), review({ type: 'review/approve', reviewer: 'ploy', at: AT }));
    expect(isSelfApproved(currentRevision(plan(ws)))).toBe(true);
  });
});

describe('discarding a draft', () => {
  it('throws away the draft, returns to the revision it came from, and logs it', () => {
    let ws = run(ready(), review({ type: 'review/submit', designedBy: 'Ploy', at: AT }), review({ type: 'review/approve', reviewer: 'Nok', at: AT }));
    const approved = currentRevision(plan(ws));
    ws = run(ws, review({ type: 'review/new-draft', at: AT }), { type: 'plan', roomId: 'r', command: { type: 'survey/update', patch: { width: 8 } } });
    ws = run(ws, review({ type: 'review/discard-draft', at: AT }));
    expect(plan(ws).revisions).toHaveLength(1);
    expect(currentRevision(plan(ws))).toBe(approved);
    expect(plan(ws).history.at(-1)).toMatchObject({ revision: 2, code: 'draft_discarded', params: { draft: 2, back: 1 }, action: 'Discarded Draft revision 2; back to revision 1' });
  });

  it('goes back to an In review revision when the draft was started from one', () => {
    let ws = run(ready(), review({ type: 'review/submit', designedBy: 'Ploy', at: AT }), review({ type: 'review/new-draft', at: AT }));
    ws = run(ws, review({ type: 'review/discard-draft', at: AT }));
    expect(currentRevision(plan(ws))).toMatchObject({ number: 1, state: 'in_review' });
  });

  it("refuses when there is no draft, or when the draft is the room's first revision", () => {
    expect(fail(ready(), review({ type: 'review/discard-draft', at: AT }))).toBe("Revision 1 is the room's first revision, so there is nothing to go back to.");
    const submitted = run(ready(), review({ type: 'review/submit', designedBy: 'Ploy', at: AT }));
    expect(fail(submitted, review({ type: 'review/discard-draft', at: AT }))).toBe('Revision 1 is not a Draft.');
  });
});

describe('approval blockers', () => {
  it('needs a device and no blocking issues; a note never holds approval', () => {
    expect(approvalBlockers(plan(ready(false)))).toEqual(['Add at least one Device before approval.']);
    let ws = run(ready(), { type: 'plan', roomId: 'r', command: { type: 'device/update', id: 'srv', patch: { demand: unknownDemand() } } });
    expect(approvalBlockers(plan(ws))).toEqual(['SRV-01 has unknown demand.']);
    ws = run(ws, { type: 'plan', roomId: 'r', command: { type: 'device/update', id: 'srv', patch: { demand: known(450) } } }, review({ type: 'note/add', id: 'n1', text: 'Confirm the PDU model', at: AT }));
    expect(approvalBlockers(plan(ws))).toEqual([]);
  });

  it('notes belong to a revision, can be added to an approved one, and keep who wrote them', () => {
    const approved = run(ready(), review({ type: 'review/submit', designedBy: '', at: AT }), review({ type: 'review/approve', reviewer: 'S', at: AT }));
    const ws = run(approved, review({ type: 'note/add', id: 'n', text: 'Cable tray moved 20 cm', by: ' Nok ', at: AT }), review({ type: 'review/new-draft', at: AT }), review({ type: 'note/add', id: 'm', text: 'Second thoughts', at: AT, revision: 1 }));
    expect(plan(ws).notes).toEqual([
      { id: 'n', text: 'Cable tray moved 20 cm', revision: 1, createdAt: AT, by: 'Nok' },
      { id: 'm', text: 'Second thoughts', revision: 1, createdAt: AT },
    ]);
    expect(plan(ws).history.filter((e) => e.code === 'note_added').map((e) => e.action)).toEqual(['Nok (unverified) added a note', 'Added a note']);
    expect(fail(ws, review({ type: 'note/add', id: 'x', text: 'nowhere', at: AT, revision: 9 }))).toBe('There is no revision 9.');
  });

  it('re-checks current content when approving', () => {
    const ws = run(ready(false), review({ type: 'review/submit', designedBy: '', at: AT }));
    expect(fail(ws, review({ type: 'review/approve', reviewer: 'S', at: AT }))).toBe('Approval is blocked: Add at least one Device before approval.');
  });

  it('AC14: an unknown reserved range blocks until acknowledged with a reason, per revision', () => {
    let ws = run(ready(), { type: 'plan', roomId: 'r', command: { type: 'reserved/add', rackId: 'rk', range: { id: 'rsv', label: 'Customer core', bottomU: 10, heightU: 4, demand: unknownDemand(), notes: '' } } });
    expect(approvalBlockers(plan(ws))).toEqual(['Reserved range U10–U13 in RK-01 has unknown demand.']);
    expect(fail(ws, review({ type: 'review/acknowledge', reservedRangeId: 'rsv', reason: ' ', by: 'Somchai', at: AT }))).toBe('Give a reason for accepting the unknown demand.');
    expect(fail(ws, review({ type: 'review/acknowledge', reservedRangeId: 'rsv', reason: 'Customer will not share', by: '', at: AT }))).toBe("Your name can't be empty.");
    ws = run(ws, review({ type: 'review/acknowledge', reservedRangeId: 'rsv', reason: 'Customer will not share', by: 'Somchai', at: AT }));
    expect(approvalBlockers(plan(ws))).toEqual([]);
    expect(currentRevision(plan(ws)).acknowledgements).toEqual([{ reservedRangeId: 'rsv', reason: 'Customer will not share', by: { name: 'Somchai', at: AT } }]);
    ws = run(ws, review({ type: 'review/submit', designedBy: '', at: AT }), review({ type: 'review/approve', reviewer: 'S', at: AT }), review({ type: 'review/new-draft', at: AT }));
    expect(approvalBlockers(plan(ws))).toEqual(['Reserved range U10–U13 in RK-01 has unknown demand.']);
    ws = run(ws, review({ type: 'review/acknowledge', reservedRangeId: 'rsv', reason: 'Still unknown', by: 'S', at: AT }), review({ type: 'review/unacknowledge', reservedRangeId: 'rsv', at: AT }));
    expect(approvalBlockers(plan(ws))).toHaveLength(1);
    expect(findReserved(currentRevision(plan(ws)).content, 'rsv')).not.toBeNull();
  });

  it('refuses acknowledgements that make no sense and edits to approved revisions', () => {
    const ws = run(ready(), { type: 'plan', roomId: 'r', command: { type: 'reserved/add', rackId: 'rk', range: { id: 'rsv', label: 'Known', bottomU: 10, heightU: 4, demand: known(300), notes: '' } } });
    expect(fail(ws, review({ type: 'review/acknowledge', reservedRangeId: 'rsv', reason: 'x', by: 'S', at: AT }))).toBe('Only unknown demand needs an acknowledgement.');
    expect(fail(ws, review({ type: 'review/acknowledge', reservedRangeId: 'nope', reason: 'x', by: 'S', at: AT }))).toBe('That reserved range no longer exists.');
    const approved = run(ws, review({ type: 'review/submit', designedBy: '', at: AT }), review({ type: 'review/approve', reviewer: 'S', at: AT }));
    expect(fail(approved, review({ type: 'review/acknowledge', reservedRangeId: 'rsv', reason: 'x', by: 'S', at: AT }))).toBe('Revision 1 is approved. Start a new draft to change it.');
    expect(fail(ws, review({ type: 'note/add', id: 'n', text: '  ', at: AT }))).toBe('Write the note first.');
  });
});
