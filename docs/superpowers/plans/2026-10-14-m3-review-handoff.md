# M3 — Review & Hand-off Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The onsite → IT → reviewer loop works.
- A Draft can be submitted and frozen as a Snapshot, reviewed with notes and acknowledgements, and approved under an unverified reviewer name. Changes after that start a new Draft Revision.
- Work moves between browsers as a Project file, with explicit conflict choices.
- The whole workspace can be backed up and restored, with a reminder.

**Architecture:** This adds review and lifecycle commands to the domain, operating on a Room's `Plan`. It also adds approval readiness (blockers), Project file export/parse/preview/import, and workspace backup. Review commands are workspace commands and are not undoable; they clear the Room's undo history, because a Snapshot is a hard boundary. The web app gains a Review tab, read-only plan and elevation views for frozen Revisions, a Project file export button, an import dialog, and backup/restore in the project tree.

**Tech Stack:** As in M1/M2. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-13-glasshouse-mvp-design.md` §4, §7, §11 (M3 row), and `docs/product/Glasshouse-Product-Specification.md` v1.1 (FR10 Review and Revisions, FR11 persistence/hand-off/backup, FR09 Acknowledged unknowns, §8 validation table; AC13, AC14, AC15, AC16).

## Decisions taken in this plan (product owner delegated decisions until MVP)

1. **Lifecycle:** Draft → In review → Approved.
   - "Start new draft" is available from In review *and* Approved. It copies the current content into Revision N+1 and never edits an earlier Revision; this is how a reviewer sends work back.
   - Approval needs a typed reviewer name (unverified) and zero blockers. Submission never requires checks to pass (FR10).
2. **Approval blockers:**
   - every `block` issue, and every `needs_ack` issue not yet acknowledged;
   - unresolved Review notes;
   - a Plan with no Devices ("Add at least one Device before approval.").
3. **Review notes** belong to the Plan, not a single Revision. They can be added and resolved while the current Revision is Draft or In review, and they carry into a new Draft until resolved.
4. **Acknowledged unknowns** belong to the Revision. They need a reason and a typed name, and an acknowledged Reserved range no longer produces its `needs_ack` issue. A new Draft starts with none, so each approval re-acknowledges.
5. **Self-approval** (same name as the designer, case-insensitive) is allowed but flagged wherever the approval is shown.
6. **Frozen Revisions are read-only in the UI.** The plan and elevation show a banner with "Start new draft". Editing controls are disabled, and the domain still rejects edits (`not_draft`).
7. **Undo** history for a Room is cleared by any review command.
8. **Project file** (`.glasshouse.json`, format `glasshouse.project`): one Project with every Revision, plus the Template versions its Devices used. Import shows a preview:
   - **Merge:** rooms present on both sides are listed with both Revision numbers and states, and each one chooses *Keep mine* or *Take incoming*. New sites and rooms are added. The local Project name is kept.
   - **Import as a copy:** new Project/Site/Room IDs and " (copy)" added to the name.
   - If a site or room ID in the file already belongs to a *different* local project, only "copy" is offered.
   - Catalog: Templates whose ID is missing locally are added, and local Templates are never overwritten. Placed Devices carry their own copies anyway.
9. **Workspace backup** (format `glasshouse.workspace`) downloads everything and records `lastBackupAt`. A reminder shows after 7 days without a backup, or when no backup exists yet, once there is at least one non-sample Project. Restore replaces the workspace only after an explicit confirmation that offers a fresh backup first.

## Global Constraints

- The M1 and M2 Global Constraints apply.
- Times are ISO 8601 strings passed **into** domain commands (`at`), so the domain stays pure and deterministic in tests.
- "Unverified" appears next to every typed name in the UI. No UI copy may say "Published", "signed" or "verified".

## Review Focus

1. **Approving after a change made in another tab or an import:** approval re-runs the blockers on the current content, never a cached list. Pinned in Task 1.
2. **Importing a project file exported from this same browser, then edited elsewhere:** conflicts are listed per Room with both Revision numbers; "Keep mine" leaves local content byte-for-byte unchanged. Pinned in Task 3.
3. **A damaged or foreign JSON file:** expect a plain-language error and no change to the workspace. Pinned in Tasks 3 and 7.
4. **Acknowledging, then changing that Reserved range's watts to known, then back to unknown:** the acknowledgement for that range still applies within the same Revision, because it is tied to the range ID. A new Draft clears it. Pinned in Task 1.
5. **Restoring a backup:** the current workspace stays untouched until the confirmation, and a failed parse changes nothing. Pinned in Tasks 2 and 8.

---

### Task 1: Review lifecycle, notes, acknowledgements and approval blockers

**Files:**
- Create: `packages/domain/src/readiness.ts`, `packages/domain/src/commands/review.ts`
- Modify: `packages/domain/src/checks/equipment.ts`, `packages/domain/src/checks/index.ts`, `packages/domain/src/commands/workspace.ts`, `packages/domain/src/index.ts`
- Test: `packages/domain/src/commands/review.test.ts`

**Interfaces:**
- Produces:
  - `checkPlan(content, acknowledged?: ReadonlySet<Id>)`, where an acknowledged Reserved range yields no `reserved_demand_unknown`;
  - `acknowledgedIds(revision)`, `revisionIssues(revision)`, `approvalBlockers(plan): string[]`, `isSelfApproved(revision)`;
  - `ReviewCommand`: `review/submit {designedBy, at}`, `review/approve {reviewer, at}`, `review/new-draft {at}`, `review/acknowledge {reservedRangeId, reason, by, at}`, `review/unacknowledge {reservedRangeId, at}`, `note/add {id, text, at}`, `note/resolve {id, resolved, at}`;
  - `applyReviewCommand(plan, cmd): Result<Plan>`;
  - `WorkspaceCommand` gains `{ type: 'review'; roomId; command: ReviewCommand }`.

- [ ] **Step 1: Write the failing test**

`packages/domain/src/commands/review.test.ts`:
```ts
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
    { type: 'room/create', siteId: 's', id: 'r', name: 'MDF-1' },
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

describe('approval blockers', () => {
  it('needs a device, no blocking issues and no open notes', () => {
    expect(approvalBlockers(plan(ready(false)))).toEqual(['Add at least one Device before approval.']);
    let ws = run(ready(), { type: 'plan', roomId: 'r', command: { type: 'device/update', id: 'srv', patch: { demand: unknownDemand() } } });
    expect(approvalBlockers(plan(ws))).toEqual(['SRV-01 has unknown demand.']);
    ws = run(ws, { type: 'plan', roomId: 'r', command: { type: 'device/update', id: 'srv', patch: { demand: known(450) } } }, review({ type: 'note/add', id: 'n1', text: 'Confirm the PDU model', at: AT }));
    expect(approvalBlockers(plan(ws))).toEqual(['1 review note is unresolved.']);
    ws = run(ws, review({ type: 'note/resolve', id: 'n1', resolved: true, at: AT }), review({ type: 'review/submit', designedBy: '', at: AT }));
    expect(approvalBlockers(plan(ws))).toEqual([]);
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
    expect(fail(approved, review({ type: 'note/add', id: 'n', text: 'late', at: AT }))).toBe('Revision 1 is approved. Start a new draft to change it.');
    expect(fail(ws, review({ type: 'note/add', id: 'n', text: '  ', at: AT }))).toBe('Write the note first.');
    expect(fail(ws, review({ type: 'note/resolve', id: 'nope', resolved: true, at: AT }))).toBe('That note no longer exists.');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @glasshouse/domain test`
Expected: FAIL, cannot resolve `../readiness`.

- [ ] **Step 3: Implement**

In `packages/domain/src/checks/equipment.ts`:
- Change the signature to `export function equipmentIssues(content: PlanContent, acknowledged: ReadonlySet<string> = new Set()): Issue[] {`.
- In the reserved-range loop, change `if (r.demand.kind !== 'unknown') continue;` to `if (r.demand.kind !== 'unknown' || acknowledged.has(r.id)) continue;`.

In `packages/domain/src/checks/index.ts`, replace the `checkPlan` function:
```ts
export function checkPlan(content: PlanContent, acknowledged: ReadonlySet<string> = new Set()): Issue[] {
  return [...placementIssues(content), ...equipmentIssues(content, acknowledged)].sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);
}
```

`packages/domain/src/readiness.ts`:
```ts
import { checkPlan, type Issue } from './checks/index';
import { racksOf } from './devices';
import { currentRevision } from './lookup';
import type { Id, Plan, Revision } from './model/types';

export const acknowledgedIds = (revision: Revision): Set<Id> => new Set(revision.acknowledgements.map((a) => a.reservedRangeId));

export const revisionIssues = (revision: Revision): Issue[] => checkPlan(revision.content, acknowledgedIds(revision));

/** Everything that must change before the current Revision can be approved, in plain language. */
export function approvalBlockers(plan: Plan): string[] {
  const revision = currentRevision(plan);
  const noDevices = racksOf(revision.content).every((r) => r.devices.length === 0);
  const issues = revisionIssues(revision)
    .filter((i) => i.severity === 'block' || i.severity === 'needs_ack')
    .map((i) => i.message);
  const openNotes = plan.notes.filter((n) => !n.resolved).length;
  return [
    ...(noDevices ? ['Add at least one Device before approval.'] : []),
    ...issues,
    ...(openNotes > 0 ? [`${openNotes} review ${openNotes === 1 ? 'note is' : 'notes are'} unresolved.`] : []),
  ];
}

export const isSelfApproved = (revision: Revision): boolean =>
  revision.designedBy !== null &&
  revision.approvedBy !== null &&
  revision.designedBy.name.trim().toLowerCase() === revision.approvedBy.name.trim().toLowerCase();
```

`packages/domain/src/commands/review.ts`:
```ts
import { castDraft, produce, type Draft } from 'immer';
import { findReserved } from '../devices';
import { createDraftRevision } from '../factories';
import { currentRevision } from '../lookup';
import { LIMITS } from '../model/defaults';
import type { Id, Plan, Revision } from '../model/types';
import { approvalBlockers } from '../readiness';
import { err, ok, type Failure, type Result } from '../result';
import { validateName } from '../validation';

export type ReviewCommand =
  | { type: 'review/submit'; designedBy: string; at: string }
  | { type: 'review/approve'; reviewer: string; at: string }
  | { type: 'review/new-draft'; at: string }
  | { type: 'review/acknowledge'; reservedRangeId: Id; reason: string; by: string; at: string }
  | { type: 'review/unacknowledge'; reservedRangeId: Id; at: string }
  | { type: 'note/add'; id: Id; text: string; at: string }
  | { type: 'note/resolve'; id: Id; resolved: boolean; at: string };

const STATE_TEXT: Record<Revision['state'], string> = { draft: 'a Draft', in_review: 'In review', approved: 'approved' };

const lastRevision = (d: Draft<Plan>): Draft<Revision> => {
  const r = d.revisions[d.revisions.length - 1];
  if (!r) throw new Error('Invariant violated: a plan has no revisions.');
  return r;
};

const frozen = (rev: Revision): Failure => err('invalid_value', `Revision ${rev.number} is approved. Start a new draft to change it.`);

function validateText(raw: string, empty: string, label: string): Result<string> {
  const text = raw.trim();
  if (text.length === 0) return err('invalid_value', empty);
  if (text.length > LIMITS.textMaxLength) return err('invalid_value', `${label} must be ${LIMITS.textMaxLength} characters or fewer.`);
  return ok(text);
}

export function applyReviewCommand(plan: Plan, cmd: ReviewCommand): Result<Plan> {
  const rev = currentRevision(plan);
  const open = rev.state !== 'approved';
  switch (cmd.type) {
    case 'review/submit': {
      if (rev.state !== 'draft') return err('invalid_value', `Revision ${rev.number} is already ${STATE_TEXT[rev.state]}.`);
      const name = cmd.designedBy.trim() === '' ? ok<string | null>(null) : validateName(cmd.designedBy, 'Designer name');
      if (!name.ok) return name;
      return ok(
        produce(plan, (d) => {
          const r = lastRevision(d);
          r.state = 'in_review';
          r.submittedAt = cmd.at;
          r.designedBy = name.value ? { name: name.value, at: cmd.at } : null;
          d.history.push({ revision: r.number, action: name.value ? `Submitted for review by ${name.value} (unverified)` : 'Submitted for review', at: cmd.at });
        }),
      );
    }
    case 'review/approve': {
      if (rev.state === 'draft') return err('invalid_value', 'Submit the Draft for review before approving it.');
      if (rev.state === 'approved') return err('invalid_value', `Revision ${rev.number} is already approved.`);
      const reviewer = validateName(cmd.reviewer, "Reviewer's name");
      if (!reviewer.ok) return reviewer;
      const blockers = approvalBlockers(plan);
      if (blockers.length > 0) {
        return err('invalid_value', `Approval is blocked: ${blockers[0]}${blockers.length > 1 ? ` (and ${blockers.length - 1} more)` : ''}`);
      }
      return ok(
        produce(plan, (d) => {
          const r = lastRevision(d);
          r.state = 'approved';
          r.approvedAt = cmd.at;
          r.approvedBy = { name: reviewer.value, at: cmd.at };
          d.history.push({ revision: r.number, action: `Approved by ${reviewer.value} (unverified)`, at: cmd.at });
        }),
      );
    }
    case 'review/new-draft': {
      if (rev.state === 'draft') return err('invalid_value', `Revision ${rev.number} is already a Draft.`);
      return ok(
        produce(plan, (d) => {
          d.revisions.push(castDraft(createDraftRevision(rev.number + 1, rev.content)));
          d.history.push({ revision: rev.number + 1, action: `Started Draft revision ${rev.number + 1} from revision ${rev.number}`, at: cmd.at });
        }),
      );
    }
    case 'review/acknowledge': {
      if (!open) return frozen(rev);
      const found = findReserved(rev.content, cmd.reservedRangeId);
      if (!found) return err('not_found', 'That reserved range no longer exists.', [cmd.reservedRangeId]);
      if (found.range.demand.kind !== 'unknown') return err('invalid_value', 'Only unknown demand needs an acknowledgement.', [cmd.reservedRangeId]);
      const reason = validateText(cmd.reason, 'Give a reason for accepting the unknown demand.', 'The reason');
      if (!reason.ok) return reason;
      const by = validateName(cmd.by, 'Your name');
      if (!by.ok) return by;
      return ok(
        produce(plan, (d) => {
          const r = lastRevision(d);
          r.acknowledgements = [
            ...r.acknowledgements.filter((a) => a.reservedRangeId !== cmd.reservedRangeId),
            { reservedRangeId: cmd.reservedRangeId, reason: reason.value, by: { name: by.value, at: cmd.at } },
          ];
          d.history.push({ revision: r.number, action: `${by.value} (unverified) acknowledged unknown demand for ${found.range.label}`, at: cmd.at });
        }),
      );
    }
    case 'review/unacknowledge': {
      if (!open) return frozen(rev);
      return ok(
        produce(plan, (d) => {
          const r = lastRevision(d);
          r.acknowledgements = r.acknowledgements.filter((a) => a.reservedRangeId !== cmd.reservedRangeId);
          d.history.push({ revision: r.number, action: 'Withdrew an acknowledgement', at: cmd.at });
        }),
      );
    }
    case 'note/add': {
      if (!open) return frozen(rev);
      const text = validateText(cmd.text, 'Write the note first.', 'A note');
      if (!text.ok) return text;
      if (plan.notes.some((n) => n.id === cmd.id)) return err('invalid_value', 'A note with this ID already exists.', [cmd.id]);
      return ok(
        produce(plan, (d) => {
          d.notes.push({ id: cmd.id, text: text.value, resolved: false, createdAt: cmd.at });
          d.history.push({ revision: rev.number, action: 'Added a review note', at: cmd.at });
        }),
      );
    }
    case 'note/resolve': {
      if (!plan.notes.some((n) => n.id === cmd.id)) return err('not_found', 'That note no longer exists.', [cmd.id]);
      if (!open) return frozen(rev);
      return ok(
        produce(plan, (d) => {
          const note = d.notes.find((n) => n.id === cmd.id);
          if (note) note.resolved = cmd.resolved;
          d.history.push({ revision: rev.number, action: cmd.resolved ? 'Resolved a review note' : 'Reopened a review note', at: cmd.at });
        }),
      );
    }
  }
}
```

In `packages/domain/src/commands/workspace.ts`:
- Add `import { applyReviewCommand, type ReviewCommand } from './review';`.
- Add `  | { type: 'review'; roomId: Id; command: ReviewCommand }` to the `WorkspaceCommand` union, before `| CatalogCommand`.
- Add this case before `case 'plan':`:
```ts
    case 'review': {
      const loc = findRoom(ws, cmd.roomId);
      if (!loc) return gone('room', cmd.roomId);
      const result = applyReviewCommand(loc.room.plan, cmd.command);
      if (!result.ok) return result;
      return ok(produce(ws, (d) => void (draftRoom(d, cmd.roomId).plan = castDraft(result.value))));
    }
```

Append to `packages/domain/src/index.ts`:
```ts
export * from './readiness';
export * from './commands/review';
```

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm --filter @glasshouse/domain test && pnpm --filter @glasshouse/domain typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(domain): review lifecycle, notes, acknowledgements and approval blockers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Workspace backup and the backup reminder

**Files:**
- Create: `packages/domain/src/backup.ts`
- Modify: `packages/domain/src/commands/workspace.ts`, `packages/domain/src/index.ts`
- Test: `packages/domain/src/backup.test.ts`

**Interfaces:**
- Produces: `BACKUP_FORMAT = 'glasshouse.workspace'`, `BACKUP_REMINDER_DAYS = 7`, `WorkspaceBackup`, `exportBackup(ws, at)`, `parseBackup(raw): Result<Workspace>`, `daysSinceBackup(ws, now): number | null`, `backupDue(ws, now): boolean`. `WorkspaceCommand` gains `{ type: 'backup/mark'; at }`.

- [ ] **Step 1: Write the failing test**

`packages/domain/src/backup.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { backupDue, daysSinceBackup, exportBackup, parseBackup } from './backup';
import { apply } from './commands/workspace';
import { createWorkspace } from './factories';
import type { Workspace } from './model/types';

const withProject = (isSample = false): Workspace => {
  const r = apply(createWorkspace(), { type: 'project/create', id: 'p', name: 'Northgate' });
  if (!r.ok) throw new Error(r.error.message);
  return isSample ? { ...r.value, projects: r.value.projects.map((p) => ({ ...p, isSample: true })) } : r.value;
};

describe('workspace backup', () => {
  it('round-trips the whole workspace and records when it was taken', () => {
    const ws = withProject();
    const file = JSON.parse(JSON.stringify(exportBackup(ws, '2026-10-14T00:00:00.000Z')));
    expect(file).toMatchObject({ format: 'glasshouse.workspace', schemaVersion: 1, exportedAt: '2026-10-14T00:00:00.000Z' });
    const restored = parseBackup(file);
    expect(restored.ok && restored.value.projects[0]?.name).toBe('Northgate');
    expect(restored.ok && restored.value.lastBackupAt).toBe('2026-10-14T00:00:00.000Z');
  });

  it('refuses foreign or damaged files with a plain message', () => {
    expect(parseBackup({ hello: 'world' })).toMatchObject({ ok: false, error: { message: "This isn't a Glasshouse workspace backup." } });
    expect(parseBackup({ format: 'glasshouse.workspace', workspace: { schemaVersion: 1, projects: 'x' } })).toMatchObject({ ok: false });
  });

  it('marks the backup time through a command', () => {
    const r = apply(withProject(), { type: 'backup/mark', at: '2026-10-14T00:00:00.000Z' });
    expect(r.ok && r.value.lastBackupAt).toBe('2026-10-14T00:00:00.000Z');
  });
});

describe('backup reminder', () => {
  const now = new Date('2026-10-20T00:00:00.000Z');
  it('is quiet with only the sample project, due without any backup, and due after seven days', () => {
    expect(backupDue(withProject(true), now)).toBe(false);
    expect(backupDue(withProject(), now)).toBe(true);
    expect(daysSinceBackup({ ...withProject(), lastBackupAt: '2026-10-14T00:00:00.000Z' }, now)).toBe(6);
    expect(backupDue({ ...withProject(), lastBackupAt: '2026-10-14T00:00:00.000Z' }, now)).toBe(false);
    expect(backupDue({ ...withProject(), lastBackupAt: '2026-10-12T23:00:00.000Z' }, now)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @glasshouse/domain test`
Expected: FAIL, cannot resolve `./backup`.

- [ ] **Step 3: Implement**

`packages/domain/src/backup.ts`:
```ts
import type { Workspace } from './model/types';
import { err, type Result } from './result';
import { parseWorkspace } from './schema';

export const BACKUP_FORMAT = 'glasshouse.workspace' as const;
export const BACKUP_REMINDER_DAYS = 7;
const DAY_MS = 86_400_000;

export interface WorkspaceBackup {
  format: typeof BACKUP_FORMAT;
  schemaVersion: number;
  exportedAt: string;
  workspace: Workspace;
}

export const exportBackup = (ws: Workspace, exportedAt: string): WorkspaceBackup => ({
  format: BACKUP_FORMAT,
  schemaVersion: ws.schemaVersion,
  exportedAt,
  workspace: { ...ws, lastBackupAt: exportedAt },
});

export function parseBackup(raw: unknown): Result<Workspace> {
  if (typeof raw !== 'object' || raw === null || (raw as { format?: unknown }).format !== BACKUP_FORMAT) {
    return err('invalid_value', "This isn't a Glasshouse workspace backup.");
  }
  return parseWorkspace((raw as { workspace?: unknown }).workspace);
}

export function daysSinceBackup(ws: Workspace, now: Date): number | null {
  if (!ws.lastBackupAt) return null;
  return Math.floor((now.getTime() - Date.parse(ws.lastBackupAt)) / DAY_MS);
}

/** Only real work needs backing up; the Sample Project alone never nags. */
export function backupDue(ws: Workspace, now: Date): boolean {
  if (!ws.projects.some((p) => !p.isSample)) return false;
  const days = daysSinceBackup(ws, now);
  return days === null || days >= BACKUP_REMINDER_DAYS;
}
```

In `packages/domain/src/commands/workspace.ts`:
- Add `  | { type: 'backup/mark'; at: string }` to the union.
- Add before `case 'plan':`:
```ts
    case 'backup/mark':
      return ok(produce(ws, (d) => void (d.lastBackupAt = cmd.at)));
```

Append to `packages/domain/src/index.ts`:
```ts
export * from './backup';
```

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm --filter @glasshouse/domain test && pnpm --filter @glasshouse/domain typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(domain): workspace backup format and seven-day reminder

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Project file export, preview and import

**Files:**
- Create: `packages/domain/src/projectFile.ts`
- Modify: `packages/domain/src/commands/workspace.ts`, `packages/domain/src/index.ts`
- Test: `packages/domain/src/projectFile.test.ts`

**Interfaces:**
- Consumes: `workspaceSchema`, `migrate`, lookups, `newId`.
- Produces:
  - `PROJECT_FILE_FORMAT = 'glasshouse.project'`, `ProjectFile { format; schemaVersion; exportedAt; project; templates }`;
  - `exportProjectFile(ws, projectId, at): Result<ProjectFile>`, `parseProjectFile(raw): Result<ProjectFile>`;
  - `RoomConflict { roomId; siteName; roomName; local: {revision; state}; incoming: {revision; state} }`;
  - `ImportPreview { projectName; projectExists; conflicts; newRooms; newTemplates; idClash }`, `previewImport(ws, file)`;
  - `ImportResolution = { mode: 'copy' } | { mode: 'merge'; takeIncoming: Id[] }`, `applyImport(ws, file, resolution): Result<Workspace>`;
  - `WorkspaceCommand` gains `{ type: 'project/import'; file: ProjectFile; resolution: ImportResolution }`.

- [ ] **Step 1: Write the failing test**

`packages/domain/src/projectFile.test.ts`:
```ts
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
    expect(file).toMatchObject({ format: 'glasshouse.project', schemaVersion: 1, exportedAt: AT, project: { id: 'p', name: 'Northgate' } });
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @glasshouse/domain test`
Expected: FAIL, cannot resolve `./projectFile`.

- [ ] **Step 3: Implement**

`packages/domain/src/projectFile.ts`:
```ts
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
```

In `packages/domain/src/commands/workspace.ts`:
- Add `import { applyImport, type ImportResolution, type ProjectFile } from '../projectFile';`.
- Add `  | { type: 'project/import'; file: ProjectFile; resolution: ImportResolution }` to the union.
- Add before `case 'plan':`:
```ts
    case 'project/import':
      return applyImport(ws, cmd.file, cmd.resolution);
```

Append to `packages/domain/src/index.ts`:
```ts
export * from './projectFile';
```

- [ ] **Step 4: Run tests, typecheck and coverage**

Run: `pnpm --filter @glasshouse/domain test && pnpm --filter @glasshouse/domain typecheck && pnpm --filter @glasshouse/domain coverage`
Expected: PASS, coverage at or above the thresholds.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(domain): project file export, conflict preview and import

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Store boundaries, review hook and file helpers

**Files:**
- Create: `apps/web/src/ui/files.ts`
- Modify: `apps/web/src/store/workspaceStore.ts`, `apps/web/src/store/hooks.ts`, `apps/web/src/features/bom/BomView.tsx`, `apps/web/src/ui/icons.tsx`
- Test: `apps/web/src/ui/files.test.ts`, `apps/web/src/store/workspaceStore.test.ts` (append)

**Interfaces:**
- Produces: the store clears a Room's undo history on any `review` command and clears all history on `project/import`; `ReviewFn = (command: ReviewCommand) => string | null`, `useReviewCommit(roomId)`; `downloadJson(filename, data)`, `downloadText(filename, text, type)`, `readJsonFile(file)` → `{ ok: true; value } | { ok: false; message }`, `slugify(name)`; icons `IconUpload`, `IconDownload`.

- [ ] **Step 1: Write the failing tests**

`apps/web/src/ui/files.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { readJsonFile, slugify } from './files';

describe('file helpers', () => {
  it('reads JSON and explains files that are not JSON', async () => {
    expect(await readJsonFile(new File(['{"a":1}'], 'x.json'))).toEqual({ ok: true, value: { a: 1 } });
    expect(await readJsonFile(new File(['nope'], 'x.json'))).toEqual({ ok: false, message: "This file isn't valid JSON." });
  });

  it('turns names into safe file names', () => {
    expect(slugify('MDF 1 / Site A')).toBe('mdf-1-site-a');
    expect(slugify('***')).toBe('glasshouse');
  });
});
```

Append to `apps/web/src/store/workspaceStore.test.ts`:
```ts
describe('review boundaries', () => {
  beforeEach(() => {
    resetWorkspaceStore();
    seed();
  });

  it('clears a room’s undo history when it is submitted for review', () => {
    setWidth('a', 6);
    setWidth('b', 7);
    store().dispatch({ type: 'review', roomId: 'a', command: { type: 'review/submit', designedBy: '', at: '2026-10-14T00:00:00.000Z' } });
    expect(store().history.a).toBeUndefined();
    expect(store().history.b?.past).toHaveLength(1);
    store().undo('a');
    expect(width('a')).toBe(6);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @glasshouse/web test`
Expected: FAIL, because `./files` can't be resolved and `history.a` is still defined.

- [ ] **Step 3: Implement**

`apps/web/src/ui/files.ts`:
```ts
export function downloadText(filename: string, text: string, type: string): void {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export const downloadJson = (filename: string, data: unknown): void => downloadText(filename, JSON.stringify(data, null, 2), 'application/json');

export async function readJsonFile(file: File): Promise<{ ok: true; value: unknown } | { ok: false; message: string }> {
  let text: string;
  try {
    text = await file.text();
  } catch (e) {
    return { ok: false, message: `Couldn't read the file: ${e instanceof Error ? e.message : String(e)}` };
  }
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, message: "This file isn't valid JSON." };
  }
}

export const slugify = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'glasshouse';
```

In `apps/web/src/store/workspaceStore.ts`:
- Add this helper above `export const useWorkspaceStore`:
```ts
/** A Snapshot is a hard boundary: undo never reaches back across a review step, and an import may replace whole Rooms. */
function historyAfter(history: Record<Id, RoomHistory>, command: WorkspaceCommand): Record<Id, RoomHistory> {
  if (command.type === 'review') {
    const { [command.roomId]: _dropped, ...rest } = history;
    return rest;
  }
  if (command.type === 'project/import') return {};
  return history;
}
```
- In `dispatch`, replace `set({ workspace: result.value, lastEdit: null });` with `set({ workspace: result.value, history: historyAfter(state.history, command), lastEdit: null });`.

Append to `apps/web/src/store/hooks.ts`:
```ts
export type ReviewFn = (command: ReviewCommand) => string | null;

export function useReviewCommit(roomId: Id): ReviewFn {
  const dispatch = useWorkspaceStore((s) => s.dispatch);
  return useCallback<ReviewFn>((command) => dispatch({ type: 'review', roomId, command })?.message ?? null, [dispatch, roomId]);
}
```
and add `type ReviewCommand` to its `@glasshouse/domain` import.

In `apps/web/src/features/bom/BomView.tsx`:
- Replace the local `slug` constant and the body of `download` so they use the helpers:
```tsx
  const download = (): void => downloadText(`${slugify(location.room.name)}-R${pad2(revision.number)}-bom.csv`, bomCsv(rows), 'text/csv;charset=utf-8');
```
- Add `import { downloadText, slugify } from '../../ui/files';`.
- Delete `const slug = …`.

Append to `apps/web/src/ui/icons.tsx`:
```tsx
export const IconUpload = (p: IconProps) => (
  <svg {...frame(14)} {...p}>
    <path d="M7 10V2.5M4 5.5L7 2.5L10 5.5M2 12H12" />
  </svg>
);
export const IconDownload = (p: IconProps) => (
  <svg {...frame(14)} {...p}>
    <path d="M7 2V9.5M4 6.5L7 9.5L10 6.5M2 12H12" />
  </svg>
);
```

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm --filter @glasshouse/web test && pnpm --filter @glasshouse/web typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(web): review boundary in undo history, review hook and file helpers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Read-only views for frozen Revisions

**Files:**
- Create: `apps/web/src/app/FrozenBanner.tsx`, `apps/web/src/app/FrozenBanner.test.tsx`
- Modify: `apps/web/src/app/RoomScreen.tsx`, `apps/web/src/app/shell.css`, `apps/web/src/features/plan/PlanView.tsx`, `apps/web/src/features/plan/Toolbar.tsx`, `apps/web/src/features/plan/usePlanGestures.ts`, `apps/web/src/features/plan/Inspector.tsx`, `apps/web/src/features/plan/inspector.css`, `apps/web/src/features/elevation/ElevationView.tsx`, `apps/web/src/features/elevation/CatalogPalette.tsx`, `apps/web/src/features/elevation/EquipmentInspector.tsx`

**Interfaces:**
- Produces: `FrozenBanner({ roomId, revision })` with "Start new draft" and "Open review"; `Toolbar({ tool, onTool, readOnly? })` shows only Select, Pan and Measure when read-only; `usePlanGestures({ …, readOnly? })` stops edit gestures and shortcuts; `Inspector({ …, readOnly? })` and `EquipmentInspector({ …, readOnly? })` wrap their body in a disabled `fieldset`; `CatalogPalette({ …, disabled? })` stops dragging and adding.

- [ ] **Step 1: Write the failing test**

`apps/web/src/app/FrozenBanner.test.tsx`:
```tsx
import { createObject, type Rack } from '@glasshouse/domain';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, expect, it } from 'vitest';
import { resetWorkspaceStore, useWorkspaceStore } from '../store/workspaceStore';
import { routes } from './routes';

beforeEach(() => {
  resetWorkspaceStore();
  const s = useWorkspaceStore.getState();
  s.setLoad({ kind: 'ready' });
  s.dispatch({ type: 'project/create', id: 'p', name: 'P' });
  s.dispatch({ type: 'site/create', projectId: 'p', id: 's', name: 'S' });
  s.dispatch({ type: 'room/create', siteId: 's', id: 'r', name: 'MDF-1' });
  s.dispatch({ type: 'plan', roomId: 'r', command: { type: 'object/add', object: { ...(createObject('rack', { x: 1, y: 0.6 }, []) as Rack), name: 'RK-01' } } });
  s.dispatch({ type: 'review', roomId: 'r', command: { type: 'review/submit', designedBy: '', at: '2026-10-14T00:00:00.000Z' } });
});

it('makes the plan read-only while In review, until a new draft starts', async () => {
  const user = userEvent.setup();
  render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/rooms/r/plan'] })} />);
  expect(screen.getByText(/Revision 01 is In review/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Place rack' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Measure' })).toBeInTheDocument();
  expect(screen.getByLabelText('Width')).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'Start new draft' }));
  expect(screen.queryByText(/is In review/)).toBeNull();
  expect(screen.getByLabelText('Width')).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Place rack' })).toBeInTheDocument();
});

it('locks the elevation palette while frozen', () => {
  render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/rooms/r/elevation'] })} />);
  expect(screen.getByText(/Revision 01 is In review/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Add Server 2U to RK-01' })).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @glasshouse/web test`
Expected: FAIL, because there is no "Revision 01 is In review" banner.

- [ ] **Step 3: Implement**

`apps/web/src/app/FrozenBanner.tsx`:
```tsx
import type { Revision } from '@glasshouse/domain';
import { useState } from 'react';
import { Link } from 'react-router';
import { useReviewCommit } from '../store/hooks';
import { pad2 } from '../ui/StatusStamp';

export function FrozenBanner({ roomId, revision }: { roomId: string; revision: Revision }) {
  const review = useReviewCommit(roomId);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="frozen-banner glass" role="status">
      <span>
        <strong>{`Revision ${pad2(revision.number)} is ${revision.state === 'approved' ? 'Approved' : 'In review'}`}</strong> and frozen, so this view is read-only.
      </span>
      <Link to={`/rooms/${roomId}/review`} className="btn btn--sm btn--quiet">
        Open review
      </Link>
      <button type="button" className="btn btn--sm btn--ink" onClick={() => setError(review({ type: 'review/new-draft', at: new Date().toISOString() }))}>
        Start new draft
      </button>
      {error ? (
        <span role="alert" className="field__error">
          {error}
        </span>
      ) : null}
    </div>
  );
}
```

Replace `apps/web/src/app/RoomScreen.tsx`:
```tsx
import { currentRevision } from '@glasshouse/domain';
import { useParams } from 'react-router';
import { BomView } from '../features/bom/BomView';
import { ElevationView } from '../features/elevation/ElevationView';
import { PlanView } from '../features/plan/PlanView';
import { ReviewView } from '../features/review/ReviewView';
import { useRoomLocation } from '../store/hooks';
import { ErrorBoundary } from './ErrorBoundary';
import { FrozenBanner } from './FrozenBanner';
import { NotFound } from './NotFound';
import { ViewTabs } from './ViewTabs';

const LABEL: Record<string, string> = { plan: 'the plan', elevation: 'the elevation', bom: 'the BOM', review: 'the review' };

export function RoomScreen() {
  const { roomId = '', view = 'plan' } = useParams();
  const location = useRoomLocation(roomId);
  if (!location) return <NotFound message="This room isn't in this browser's workspace." />;
  const revision = currentRevision(location.room.plan);
  const readOnly = revision.state !== 'draft';
  let body;
  if (view === 'plan') body = <PlanView key={roomId} location={location} readOnly={readOnly} />;
  else if (view === 'elevation') body = <ElevationView key={roomId} location={location} readOnly={readOnly} />;
  else if (view === 'bom') body = <BomView key={roomId} location={location} />;
  else if (view === 'review') body = <ReviewView key={roomId} location={location} />;
  else return <NotFound message="That view doesn't exist for this room." />;
  return (
    <div className="room-screen">
      <ViewTabs roomId={roomId} />
      {readOnly && (view === 'plan' || view === 'elevation') ? <FrozenBanner roomId={roomId} revision={revision} /> : null}
      <ErrorBoundary key={view} label={LABEL[view] ?? 'this view'}>
        {body}
      </ErrorBoundary>
    </div>
  );
}
```
`ReviewView` is created in Task 6. Until then, create `apps/web/src/features/review/ReviewView.tsx` with Task 6 Step 3's final content, or do Tasks 5 and 6 together. **Decision: do Task 5 Step 3 and Task 6 Step 3 together**, then run both tests.

Append to `apps/web/src/app/shell.css`:
```css
.frozen-banner {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 14px;
  padding: 10px 14px;
  border-color: rgb(154 90 0 / 0.35);
  background: rgb(255 243 223 / 0.85);
  font-size: 13px;
}

.frozen-banner > span:first-child {
  flex: 1 1 320px;
}
```

In `apps/web/src/features/plan/PlanView.tsx`:
- Change the signature to `export function PlanView({ location, readOnly = false }: { location: RoomLocation; readOnly?: boolean }) {`.
- Pass `readOnly` into `usePlanGestures({ content, tool, setTool, selectedId: selected?.id ?? null, select, viewport, commit, readOnly })`.
- Render `<Toolbar tool={tool} onTool={setTool} readOnly={readOnly} />`.
- Render `<Inspector content={content} selected={selected} commit={commit} onDeleted={() => select(null)} readOnly={readOnly} />`.
- Add, after the `useState` for `tool`:
```tsx
  useEffect(() => {
    if (readOnly && tool !== 'select' && tool !== 'pan' && tool !== 'measure') setTool('select');
  }, [readOnly, tool]);
```
- Add `useEffect` to the `react` import.

In `apps/web/src/features/plan/Toolbar.tsx`, replace the component:
```tsx
const VIEW_ONLY = new Set<Tool>(['select', 'pan', 'measure']);

export function Toolbar({ tool, onTool, readOnly = false }: { tool: Tool; onTool: (tool: Tool) => void; readOnly?: boolean }) {
  const tools = readOnly ? TOOLS.filter((t) => VIEW_ONLY.has(t.id)) : TOOLS;
  return (
    <div className="toolbar glass" role="toolbar" aria-label="Plan tools" aria-orientation="vertical">
      {tools.map((spec, i) => (
        <Fragment key={spec.id}>
          {i > 0 && tools[i - 1]?.group !== spec.group ? <span className="toolbar__sep" aria-hidden="true" /> : null}
          <button
            type="button"
            className="tool"
            aria-pressed={tool === spec.id}
            aria-label={spec.label}
            title={spec.shortcut ? `${spec.label} (${spec.shortcut})` : spec.label}
            onClick={() => onTool(spec.id)}
          >
            <spec.Icon />
          </button>
        </Fragment>
      ))}
    </div>
  );
}
```

In `apps/web/src/features/plan/usePlanGestures.ts`:
- Add `readOnly?: boolean;` to `interface Args`.
- Destructure it: `export function usePlanGestures({ content, tool, setTool, selectedId, select, viewport, commit, readOnly = false }: Args) {`.
- In `onPointerDown`, insert right after the `if (tool === 'measure') { … return; }` block:
```ts
    if (readOnly) {
      select(hitTest(content.objects, world)?.id ?? null);
      return;
    }
```
- In `onKeyDown`, replace the block
```ts
    const nextTool = toolForKey(e.key);
    if (nextTool) {
      setTool(nextTool);
      return;
    }
```
with:
```ts
    const nextTool = toolForKey(e.key);
    if (nextTool && (!readOnly || nextTool === 'select' || nextTool === 'pan' || nextTool === 'measure')) {
      setTool(nextTool);
      return;
    }
    if (readOnly) return;
```

In `apps/web/src/features/plan/Inspector.tsx`, add `readOnly?: boolean;` to the props and wrap the conditional body:
```tsx
export function Inspector({ content, selected, commit, onDeleted, readOnly = false }: InspectorProps) {
  return (
    <aside className="inspector glass" aria-label={selected ? `${selected.name} details` : 'Survey'}>
      <fieldset className="inspector__lock" disabled={readOnly}>
        {selected ? (
          <ObjectInspector key={selected.id} object={selected} commit={commit} onDeleted={onDeleted} />
        ) : (
          <SurveyPanel survey={content.survey} commit={commit} />
        )}
      </fieldset>
    </aside>
  );
}
```

Append to `apps/web/src/features/plan/inspector.css`:
```css
.inspector__lock {
  margin: 0;
  padding: 0;
  border: 0;
  min-width: 0;
}

.inspector__lock:disabled .field__box {
  background: rgb(255 255 255 / 0.35);
}
```

In `apps/web/src/features/elevation/CatalogPalette.tsx`:
- Add `disabled?: boolean;` to the props and destructure it with a default of `false`.
- Set `draggable={!disabled && t.mounting === 'rack'}`.
- Change the add-button condition to `t.mounting === 'rack' && activeRack && !disabled`.
- Change the note text to `{disabled ? 'This Revision is frozen. Start a new draft to add Devices.' : `Drag onto a rack, or add to ${activeRack ? activeRack.name : 'the selected rack'} at its lowest free U.`}`.

In `apps/web/src/features/elevation/EquipmentInspector.tsx`:
- Add `readOnly?: boolean;` to the props and destructure it with a default of `false`.
- Wrap `{body}` in `<fieldset className="inspector__lock" disabled={readOnly}>{body}</fieldset>`.

In `apps/web/src/features/elevation/ElevationView.tsx`:
- Change the signature to `export function ElevationView({ location, readOnly = false }: { location: RoomLocation; readOnly?: boolean }) {`.
- Pass `disabled={readOnly}` to `CatalogPalette` and `readOnly={readOnly}` to `EquipmentInspector`.
- At the top of `place`, add `if (readOnly) return;`.

- [ ] **Step 4: Run tests and typecheck** (after Task 6 Step 3)

Run: `pnpm --filter @glasshouse/web test && pnpm --filter @glasshouse/web typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(web): read-only plan and elevation for frozen revisions

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Review view

**Files:**
- Create: `apps/web/src/features/review/ReviewView.tsx`, `apps/web/src/features/review/ApprovalPanel.tsx`, `apps/web/src/features/review/UnknownsPanel.tsx`, `apps/web/src/features/review/NotesPanel.tsx`, `apps/web/src/features/review/HistoryPanel.tsx`, `apps/web/src/features/review/review.css`, `apps/web/src/ui/time.ts`
- Modify: `apps/web/src/app/ViewTabs.tsx`, `apps/web/src/app/shell.css`
- Test: `apps/web/src/features/review/ReviewView.test.tsx`

**Interfaces:**
- Consumes: `useReviewCommit`, `approvalBlockers`, `isSelfApproved`, `racksOf`, `formatURange`, `StatusStamp`, `pad2`.
- Produces: `ReviewView({ location })` at `/rooms/:roomId/review`; `formatTime(iso)`; a "Review" tab whose accessible name stays "Review", with an `aria-hidden` badge counting blockers.

- [ ] **Step 1: Write the failing test**

`apps/web/src/features/review/ReviewView.test.tsx`:
```tsx
import { createObject, currentRevision, findRoom, type Rack, type Template } from '@glasshouse/domain';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, expect, it } from 'vitest';
import { routes } from '../../app/routes';
import { resetWorkspaceStore, useWorkspaceStore } from '../../store/workspaceStore';

const revision = () => currentRevision(findRoom(useWorkspaceStore.getState().workspace, 'r')!.room.plan);

function seed({ device = true, reserved = false } = {}): void {
  resetWorkspaceStore();
  const s = useWorkspaceStore.getState();
  s.setLoad({ kind: 'ready' });
  const t = (id: string) => s.workspace.catalog.find((x) => x.id === id) as Template;
  s.dispatch({ type: 'project/create', id: 'p', name: 'P' });
  s.dispatch({ type: 'site/create', projectId: 'p', id: 's', name: 'S' });
  s.dispatch({ type: 'room/create', siteId: 's', id: 'r', name: 'MDF-1' });
  s.dispatch({ type: 'plan', roomId: 'r', command: { type: 'object/add', object: { ...(createObject('rack', { x: 1, y: 0.6 }, []) as Rack), id: 'rk', name: 'RK-01' } } });
  if (device) s.dispatch({ type: 'plan', roomId: 'r', command: { type: 'device/place', id: 'srv', rackId: 'rk', bottomU: 1, template: t('tpl-server-2u') } });
  if (reserved) {
    s.dispatch({ type: 'plan', roomId: 'r', command: { type: 'reserved/add', rackId: 'rk', range: { id: 'rsv', label: 'Customer core', bottomU: 10, heightU: 4, demand: { kind: 'unknown' }, notes: '' } } });
  }
}
const open = () => render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/rooms/r/review'] })} />);

beforeEach(() => seed());

it('AC13/AC16: submits, approves (flagging self-approval) and starts a new draft', async () => {
  const user = userEvent.setup();
  open();
  await user.type(screen.getByLabelText('Designed by (optional, unverified)'), 'Ploy');
  await user.click(screen.getByRole('button', { name: 'Submit for review' }));
  expect(revision()).toMatchObject({ state: 'in_review', designedBy: { name: 'Ploy' } });
  expect(screen.getByText('Ready for approval: no blocking issues.')).toBeInTheDocument();
  await user.type(screen.getByLabelText('Reviewer name (unverified)'), 'ploy');
  await user.click(screen.getByRole('button', { name: 'Approve revision' }));
  expect(revision()).toMatchObject({ state: 'approved', approvedBy: { name: 'ploy' } });
  expect(screen.getByText('Self-approved')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Start new draft' }));
  expect(revision()).toMatchObject({ number: 2, state: 'draft' });
});

it('shows blockers and keeps approval disabled until they clear', async () => {
  const user = userEvent.setup();
  seed({ device: false });
  open();
  await user.click(screen.getByRole('button', { name: 'Submit for review' }));
  expect(screen.getByText('Add at least one Device before approval.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Approve revision' })).toBeDisabled();
});

it('AC14: acknowledges unknown reserved demand with a reason and a name', async () => {
  const user = userEvent.setup();
  seed({ reserved: true });
  open();
  expect(screen.getByText('Reserved range U10–U13 in RK-01 has unknown demand.')).toBeInTheDocument();
  await user.type(screen.getByLabelText('Why is it acceptable?'), 'Customer will not share figures');
  await user.type(screen.getByLabelText('Your name (unverified)'), 'Somchai');
  await user.click(screen.getByRole('button', { name: 'Acknowledge' }));
  expect(revision().acknowledgements).toHaveLength(1);
  expect(screen.getByText(/Accepted by Somchai \(unverified\)/)).toBeInTheDocument();
  expect(screen.queryByText('Reserved range U10–U13 in RK-01 has unknown demand.')).toBeNull();
});

it('adds and resolves review notes', async () => {
  const user = userEvent.setup();
  open();
  await user.type(screen.getByLabelText('New review note'), 'Confirm the PDU model');
  await user.click(screen.getByRole('button', { name: 'Add note' }));
  expect(screen.getByText('1 review note is unresolved.')).toBeInTheDocument();
  await user.click(screen.getByRole('checkbox', { name: 'Confirm the PDU model' }));
  expect(screen.queryByText('1 review note is unresolved.')).toBeNull();
  expect(screen.getByRole('link', { name: 'Review' })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @glasshouse/web test`
Expected: FAIL, cannot resolve `../features/review/ReviewView`.

- [ ] **Step 3: Implement**

`apps/web/src/ui/time.ts`:
```ts
export function formatTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
```

`apps/web/src/features/review/ApprovalPanel.tsx`:
```tsx
import { approvalBlockers, currentRevision, isSelfApproved, type Plan } from '@glasshouse/domain';
import { useState, type FormEvent } from 'react';
import { useReviewCommit } from '../../store/hooks';
import { pad2, StatusStamp } from '../../ui/StatusStamp';
import { formatTime } from '../../ui/time';

const now = (): string => new Date().toISOString();

export function ApprovalPanel({ roomId, plan }: { roomId: string; plan: Plan }) {
  const revision = currentRevision(plan);
  const review = useReviewCommit(roomId);
  const blockers = approvalBlockers(plan);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const act = (problem: string | null): void => {
    setError(problem);
    if (problem === null) setName('');
  };
  const submit = (e: FormEvent): void => {
    e.preventDefault();
    act(review({ type: 'review/submit', designedBy: name, at: now() }));
  };
  const approve = (e: FormEvent): void => {
    e.preventDefault();
    act(review({ type: 'review/approve', reviewer: name, at: now() }));
  };
  const newDraft = (): void => act(review({ type: 'review/new-draft', at: now() }));

  return (
    <section className="review-card glass" aria-labelledby="approval-h">
      <header className="review-card__head">
        <h2 id="approval-h">{`Revision ${pad2(revision.number)}`}</h2>
        <StatusStamp state={revision.state} />
        {isSelfApproved(revision) ? <span className="stamp stamp--warn">Self-approved</span> : null}
      </header>
      <dl className="review-facts">
        <dt>Designed by</dt>
        <dd>{revision.designedBy ? `${revision.designedBy.name} (unverified)` : '—'}</dd>
        <dt>Submitted</dt>
        <dd>{formatTime(revision.submittedAt)}</dd>
        <dt>Approved by</dt>
        <dd>{revision.approvedBy ? `${revision.approvedBy.name} (unverified)` : '—'}</dd>
        <dt>Approved</dt>
        <dd>{formatTime(revision.approvedAt)}</dd>
      </dl>

      {revision.state === 'draft' ? (
        <form className="review-form" onSubmit={submit}>
          <div className="field">
            <label htmlFor="designer" className="field__label">
              Designed by (optional, unverified)
            </label>
            <div className="field__box">
              <input id="designer" className="field__input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
            </div>
          </div>
          <button type="submit" className="btn btn--ink">
            Submit for review
          </button>
          <p className="review-note">Submitting freezes this Revision as a Snapshot. The checks don't have to pass yet.</p>
        </form>
      ) : null}

      {revision.state === 'in_review' ? (
        <form className="review-form" onSubmit={approve}>
          <div className="field">
            <label htmlFor="reviewer" className="field__label">
              Reviewer name (unverified)
            </label>
            <div className="field__box">
              <input id="reviewer" className="field__input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
            </div>
          </div>
          <div className="review-form__actions">
            <button type="submit" className="btn btn--ink" disabled={blockers.length > 0}>
              Approve revision
            </button>
            <button type="button" className="btn" onClick={newDraft}>
              Start new draft
            </button>
          </div>
        </form>
      ) : null}

      {revision.state === 'approved' ? (
        <div className="review-form">
          <p className="review-note">Approved Revisions never change. To make changes, start a new Draft.</p>
          <button type="button" className="btn btn--ink" onClick={newDraft}>
            Start new draft
          </button>
        </div>
      ) : null}

      {revision.state !== 'approved' ? (
        blockers.length > 0 ? (
          <div className="blockers">
            <h3>Approval is blocked by</h3>
            <ul>
              {blockers.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="review-ready">Ready for approval: no blocking issues.</p>
        )
      ) : null}
      {error ? (
        <p role="alert" className="field__error">
          {error}
        </p>
      ) : null}
    </section>
  );
}
```

`apps/web/src/features/review/UnknownsPanel.tsx`:
```tsx
import { formatURange, racksOf, type Rack, type ReservedRange, type Revision } from '@glasshouse/domain';
import { useState, type FormEvent } from 'react';
import { useReviewCommit } from '../../store/hooks';

function AcknowledgeForm({ roomId, range, disabled }: { roomId: string; range: ReservedRange; disabled: boolean }) {
  const review = useReviewCommit(roomId);
  const [reason, setReason] = useState('');
  const [by, setBy] = useState('');
  const [error, setError] = useState<string | null>(null);
  const submit = (e: FormEvent): void => {
    e.preventDefault();
    setError(review({ type: 'review/acknowledge', reservedRangeId: range.id, reason, by, at: new Date().toISOString() }));
  };
  return (
    <form className="ack-form" onSubmit={submit}>
      <fieldset disabled={disabled} className="inspector__lock">
        <div className="field">
          <label htmlFor={`${range.id}-reason`} className="field__label">
            Why is it acceptable?
          </label>
          <div className="field__box field__box--multiline">
            <textarea id={`${range.id}-reason`} className="field__input" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        </div>
        <div className="ack-form__row">
          <div className="field">
            <label htmlFor={`${range.id}-by`} className="field__label">
              Your name (unverified)
            </label>
            <div className="field__box">
              <input id={`${range.id}-by`} className="field__input" value={by} onChange={(e) => setBy(e.target.value)} />
            </div>
          </div>
          <button type="submit" className="btn">
            Acknowledge
          </button>
        </div>
      </fieldset>
      {error ? (
        <p role="alert" className="field__error">
          {error}
        </p>
      ) : null}
    </form>
  );
}

export function UnknownsPanel({ roomId, revision }: { roomId: string; revision: Revision }) {
  const review = useReviewCommit(roomId);
  const frozen = revision.state === 'approved';
  const items: { rack: Rack; range: ReservedRange }[] = racksOf(revision.content).flatMap((rack) =>
    rack.reserved.filter((r) => r.demand.kind === 'unknown').map((range) => ({ rack, range })),
  );
  return (
    <section className="review-card glass" aria-labelledby="unknowns-h">
      <h2 id="unknowns-h">Unknown Reserved-range demand</h2>
      {items.length === 0 ? <p className="review-note">No Reserved range has unknown demand.</p> : null}
      <ul className="unknowns">
        {items.map(({ rack, range }) => {
          const ack = revision.acknowledgements.find((a) => a.reservedRangeId === range.id);
          return (
            <li key={range.id} className="unknowns__item">
              {ack ? null : <p className="unknowns__issue">{`Reserved range ${formatURange(range)} in ${rack.name} has unknown demand.`}</p>}
              <p className="unknowns__what">
                <strong>{range.label}</strong> <span className="mono">{`${formatURange(range)} · ${rack.name}`}</span>
              </p>
              {ack ? (
                <div className="unknowns__ack">
                  <p>{`Accepted by ${ack.by.name} (unverified): ${ack.reason}`}</p>
                  <button
                    type="button"
                    className="btn btn--sm btn--quiet"
                    disabled={frozen}
                    onClick={() => review({ type: 'review/unacknowledge', reservedRangeId: range.id, at: new Date().toISOString() })}
                  >
                    Withdraw
                  </button>
                </div>
              ) : (
                <AcknowledgeForm roomId={roomId} range={range} disabled={frozen} />
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
```

`apps/web/src/features/review/NotesPanel.tsx`:
```tsx
import { newId, type Plan } from '@glasshouse/domain';
import { useState, type FormEvent } from 'react';
import { useReviewCommit } from '../../store/hooks';
import { formatTime } from '../../ui/time';

export function NotesPanel({ roomId, plan, frozen }: { roomId: string; plan: Plan; frozen: boolean }) {
  const review = useReviewCommit(roomId);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const add = (e: FormEvent): void => {
    e.preventDefault();
    const problem = review({ type: 'note/add', id: newId(), text, at: new Date().toISOString() });
    setError(problem);
    if (problem === null) setText('');
  };
  return (
    <section className="review-card glass" aria-labelledby="notes-h">
      <h2 id="notes-h">Review notes</h2>
      <form className="review-form" onSubmit={add}>
        <fieldset disabled={frozen} className="inspector__lock">
          <div className="field">
            <label htmlFor="new-note" className="field__label">
              New review note
            </label>
            <div className="field__box field__box--multiline">
              <textarea id="new-note" className="field__input" rows={2} value={text} onChange={(e) => setText(e.target.value)} />
            </div>
          </div>
          <button type="submit" className="btn btn--sm">
            Add note
          </button>
        </fieldset>
        {error ? (
          <p role="alert" className="field__error">
            {error}
          </p>
        ) : null}
      </form>
      {plan.notes.length === 0 ? <p className="review-note">No notes yet. Notes must be resolved before approval.</p> : null}
      <ul className="notes">
        {plan.notes.map((n) => (
          <li key={n.id} className={`notes__item${n.resolved ? ' is-resolved' : ''}`}>
            <input
              id={`note-${n.id}`}
              type="checkbox"
              checked={n.resolved}
              disabled={frozen}
              onChange={(e) => setError(review({ type: 'note/resolve', id: n.id, resolved: e.target.checked, at: new Date().toISOString() }))}
            />
            <label htmlFor={`note-${n.id}`}>{n.text}</label>
            <span className="notes__time">{formatTime(n.createdAt)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

`apps/web/src/features/review/HistoryPanel.tsx`:
```tsx
import { isSelfApproved, type Plan } from '@glasshouse/domain';
import { pad2, StatusStamp } from '../../ui/StatusStamp';
import { formatTime } from '../../ui/time';

export function HistoryPanel({ plan }: { plan: Plan }) {
  const revisions = [...plan.revisions].reverse();
  const events = [...plan.history].reverse();
  return (
    <section className="review-card glass" aria-labelledby="history-h">
      <h2 id="history-h">Revisions and history</h2>
      <ul className="revisions">
        {revisions.map((r) => (
          <li key={r.number} className="revisions__item">
            <span className="mono revisions__n">{`R${pad2(r.number)}`}</span>
            <StatusStamp state={r.state} />
            <span className="revisions__who">
              {r.designedBy ? `Designed by ${r.designedBy.name}` : 'Designer not recorded'}
              {r.approvedBy ? ` · approved by ${r.approvedBy.name} ${formatTime(r.approvedAt)}` : ''}
              {r.designedBy || r.approvedBy ? ' (unverified)' : ''}
              {isSelfApproved(r) ? ' · self-approved' : ''}
            </span>
          </li>
        ))}
      </ul>
      <ol className="events">
        {events.map((e, i) => (
          <li key={`${e.at}-${i}`}>
            <span className="events__time mono">{formatTime(e.at)}</span>
            <span className="mono events__rev">{`R${pad2(e.revision)}`}</span>
            <span>{e.action}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
```

`apps/web/src/features/review/ReviewView.tsx`:
```tsx
import { currentRevision, type RoomLocation } from '@glasshouse/domain';
import { ApprovalPanel } from './ApprovalPanel';
import { HistoryPanel } from './HistoryPanel';
import { NotesPanel } from './NotesPanel';
import { UnknownsPanel } from './UnknownsPanel';
import './review.css';

export function ReviewView({ location }: { location: RoomLocation }) {
  const { plan, id: roomId } = location.room;
  const revision = currentRevision(plan);
  return (
    <div className="review">
      <div className="review__col">
        <ApprovalPanel roomId={roomId} plan={plan} />
        <UnknownsPanel roomId={roomId} revision={revision} />
      </div>
      <div className="review__col">
        <NotesPanel roomId={roomId} plan={plan} frozen={revision.state === 'approved'} />
        <HistoryPanel plan={plan} />
      </div>
    </div>
  );
}
```

`apps/web/src/features/review/review.css`:
```css
.review {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--gap);
  align-items: start;
}

.review__col {
  display: flex;
  flex-direction: column;
  gap: var(--gap);
  min-width: 0;
}

.review-card {
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.review-card h2 {
  font-size: 16px;
  font-weight: 700;
}

.review-card__head {
  display: flex;
  align-items: center;
  gap: 10px;
}

.review-card__head h2 {
  font-size: 20px;
  letter-spacing: -0.02em;
}

.review-facts {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 4px 14px;
  margin: 0;
  font-size: 13px;
}

.review-facts dt {
  color: var(--ink-2);
}

.review-facts dd {
  margin: 0;
}

.review-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.review-form__actions {
  display: flex;
  gap: 8px;
}

.review-note {
  font-size: 12px;
  color: var(--ink-2);
}

.review-ready {
  padding: 8px 12px;
  border-radius: var(--radius-control);
  background: rgb(17 121 90 / 0.12);
  color: var(--ok);
  font-weight: 600;
  font-size: 13px;
}

.blockers {
  padding: 10px 12px;
  border-radius: var(--radius-control);
  border: 1px solid rgb(184 50 42 / 0.3);
  background: var(--block-bg);
}

.blockers h3 {
  font-size: 13px;
  font-weight: 700;
  color: var(--block);
}

.blockers ul {
  margin: 6px 0 0;
  padding-left: 18px;
  font-size: 13px;
}

.stamp--warn {
  background: var(--warn-bg);
  color: var(--warn);
}

.unknowns,
.notes,
.revisions,
.events {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.unknowns__item {
  padding: 12px;
  border-radius: var(--radius-control);
  background: rgb(255 255 255 / 0.45);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.unknowns__issue {
  font-size: 13px;
  font-weight: 600;
  color: var(--warn);
}

.unknowns__what {
  font-size: 13px;
}

.unknowns__ack {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  font-size: 13px;
  color: var(--ok);
}

.ack-form__row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: end;
  gap: 8px;
  margin-top: 8px;
}

.notes__item {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: start;
  gap: 10px;
  font-size: 13px;
}

.notes__item.is-resolved label {
  color: var(--ink-2);
  text-decoration: line-through;
}

.notes__time,
.events__time {
  font-size: 11px;
  color: var(--ink-2);
  white-space: nowrap;
}

.revisions__item {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.revisions__n,
.events__rev {
  font-weight: 600;
}

.revisions__who {
  color: var(--ink-2);
}

.events li {
  display: grid;
  grid-template-columns: auto auto minmax(0, 1fr);
  gap: 10px;
  font-size: 12px;
}
```

In `apps/web/src/app/ViewTabs.tsx`, replace the file:
```tsx
import { approvalBlockers, currentRevision } from '@glasshouse/domain';
import { NavLink } from 'react-router';
import { useRoomLocation } from '../store/hooks';

const VIEWS = [
  { id: 'plan', label: 'Plan' },
  { id: 'elevation', label: 'Elevation' },
  { id: 'bom', label: 'Devices & BOM' },
  { id: 'review', label: 'Review' },
] as const;

export function ViewTabs({ roomId }: { roomId: string }) {
  const location = useRoomLocation(roomId);
  const plan = location?.room.plan;
  const blockers = plan && currentRevision(plan).state !== 'approved' ? approvalBlockers(plan).length : 0;
  return (
    <nav className="view-tabs glass" aria-label="Room views">
      <span className="view-tabs__seg">
        {VIEWS.map((v) => (
          <NavLink key={v.id} to={`/rooms/${roomId}/${v.id}`} className={({ isActive }) => `view-tab${isActive ? ' is-active' : ''}`}>
            {v.label}
            {v.id === 'review' && blockers > 0 ? (
              <span className="view-tab__badge mono" aria-hidden="true">
                {blockers}
              </span>
            ) : null}
          </NavLink>
        ))}
      </span>
      <span className="view-tabs__meta">Grid 0.50 m · snap 0.10 m</span>
    </nav>
  );
}
```

Append to `apps/web/src/app/shell.css`:
```css
.view-tab__badge {
  margin-left: 6px;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--block-fill);
  color: #fff;
  font-size: 11px;
  line-height: 18px;
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm --filter @glasshouse/web test && pnpm --filter @glasshouse/web typecheck`
Expected: PASS for both the Task 5 and Task 6 tests.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(web): review view with approval, acknowledgements, notes and history

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Project file export and import dialog

**Files:**
- Create: `apps/web/src/features/handoff/ImportDialog.tsx`, `apps/web/src/features/handoff/handoff.css`
- Modify: `apps/web/src/app/TitleBlock.tsx`, `apps/web/src/features/tree/ProjectTree.tsx`
- Test: `apps/web/src/features/handoff/ImportDialog.test.tsx`

**Interfaces:**
- Consumes: `exportProjectFile`, `parseProjectFile`, `previewImport`, `ProjectFile`, `downloadJson`, `readJsonFile`, `slugify`.
- Produces: an "Export project file" button in the title block (when a room is open); an "Import project file" button and hidden file input (`aria-label="Choose a project file"`) in the tree header; `ImportDialog({ file, onClose })` as a modal `role="dialog"` with per-Room Keep mine / Take incoming and a copy option.

- [ ] **Step 1: Write the failing test**

`apps/web/src/features/handoff/ImportDialog.test.tsx`:
```tsx
import { currentRevision, exportProjectFile, findRoom } from '@glasshouse/domain';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, expect, it } from 'vitest';
import { routes } from '../../app/routes';
import { resetWorkspaceStore, useWorkspaceStore } from '../../store/workspaceStore';

const width = () => currentRevision(findRoom(useWorkspaceStore.getState().workspace, 'r')!.room.plan).content.survey.width;
let exported = '';

beforeEach(() => {
  resetWorkspaceStore();
  const s = useWorkspaceStore.getState();
  s.setLoad({ kind: 'ready' });
  s.dispatch({ type: 'project/create', id: 'p', name: 'Northgate' });
  s.dispatch({ type: 'site/create', projectId: 'p', id: 's', name: 'Site A' });
  s.dispatch({ type: 'room/create', siteId: 's', id: 'r', name: 'MDF-1' });
  const file = exportProjectFile(useWorkspaceStore.getState().workspace, 'p', '2026-10-14T00:00:00.000Z');
  if (!file.ok) throw new Error(file.error.message);
  exported = JSON.stringify(file.value);
  s.dispatch({ type: 'plan', roomId: 'r', command: { type: 'survey/update', patch: { width: 7 } } });
});

const open = () => render(<RouterProvider router={createMemoryRouter(routes)} />);

it('AC15: shows the conflict and takes the incoming room only when chosen', async () => {
  const user = userEvent.setup();
  open();
  await user.upload(screen.getByLabelText('Choose a project file'), new File([exported], 'northgate.glasshouse.json', { type: 'application/json' }));
  const dialog = await screen.findByRole('dialog', { name: 'Import “Northgate”' });
  expect(dialog).toHaveTextContent('0 new rooms · 1 room already here · 0 new templates');
  expect(dialog).toHaveTextContent('MDF-1');
  await user.click(screen.getByRole('button', { name: 'MDF-1: take incoming' }));
  await user.click(screen.getByRole('button', { name: 'Import' }));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(width()).toBe(5);
});

it('keeps mine by default and can import as a copy', async () => {
  const user = userEvent.setup();
  open();
  await user.upload(screen.getByLabelText('Choose a project file'), new File([exported], 'n.json'));
  await screen.findByRole('dialog');
  await user.click(screen.getByRole('button', { name: 'Import as a copy' }));
  await user.click(screen.getByRole('button', { name: 'Import' }));
  expect(useWorkspaceStore.getState().workspace.projects.map((p) => p.name)).toEqual(['Northgate', 'Northgate (copy)']);
  expect(width()).toBe(7);
});

it('explains files that are not project files and changes nothing', async () => {
  const user = userEvent.setup();
  open();
  const before = useWorkspaceStore.getState().workspace;
  await user.upload(screen.getByLabelText('Choose a project file'), new File(['{"hello":1}'], 'x.json'));
  expect(await screen.findByRole('alert')).toHaveTextContent("This isn't a Glasshouse project file.");
  expect(useWorkspaceStore.getState().workspace).toBe(before);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @glasshouse/web test`
Expected: FAIL, because there is no element labelled "Choose a project file".

- [ ] **Step 3: Implement**

`apps/web/src/features/handoff/ImportDialog.tsx`:
```tsx
import { previewImport, type ProjectFile } from '@glasshouse/domain';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { pad2, STATE_LABEL } from '../../ui/StatusStamp';
import { formatTime } from '../../ui/time';
import './handoff.css';

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

export function ImportDialog({ file, onClose }: { file: ProjectFile; onClose: () => void }) {
  const workspace = useWorkspaceStore((s) => s.workspace);
  const dispatch = useWorkspaceStore((s) => s.dispatch);
  const preview = useMemo(() => previewImport(workspace, file), [workspace, file]);
  const [mode, setMode] = useState<'merge' | 'copy'>(preview.idClash ? 'copy' : 'merge');
  const [take, setTake] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('button:not([disabled])')?.focus();
  }, []);

  const choose = (roomId: string, incoming: boolean): void =>
    setTake((prev) => {
      const next = new Set(prev);
      if (incoming) next.add(roomId);
      else next.delete(roomId);
      return next;
    });
  const confirm = (): void => {
    const problem = dispatch({ type: 'project/import', file, resolution: mode === 'copy' ? { mode: 'copy' } : { mode: 'merge', takeIncoming: [...take] } });
    setError(problem?.message ?? null);
    if (!problem) onClose();
  };

  return (
    <div
      className="dialog-backdrop"
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <div ref={ref} className="dialog glass" role="dialog" aria-modal="true" aria-labelledby="import-h">
        <h2 id="import-h">{`Import “${preview.projectName}”`}</h2>
        <p className="dialog__meta">
          {`${plural(preview.newRooms, 'new room', 'new rooms')} · ${plural(preview.conflicts.length, 'room already here', 'rooms already here')} · ${plural(preview.newTemplates, 'new template', 'new templates')}`}
          {file.exportedAt ? ` · exported ${formatTime(file.exportedAt)}` : ''}
        </p>
        <div className="seg" role="group" aria-label="How to import">
          <button type="button" aria-pressed={mode === 'merge'} disabled={preview.idClash} onClick={() => setMode('merge')}>
            Merge into this browser
          </button>
          <button type="button" aria-pressed={mode === 'copy'} onClick={() => setMode('copy')}>
            Import as a copy
          </button>
        </div>
        {preview.idClash ? <p className="dialog__note">Some rooms in this file belong to another project here, so it can only be imported as a copy.</p> : null}
        {mode === 'copy' ? <p className="dialog__note">The copy gets new IDs and “(copy)” after its name. Nothing here changes.</p> : null}
        {mode === 'merge' && preview.conflicts.length > 0 ? (
          <table className="conflicts">
            <thead>
              <tr>
                <th scope="col">Room</th>
                <th scope="col">Here</th>
                <th scope="col">In the file</th>
                <th scope="col">Use</th>
              </tr>
            </thead>
            <tbody>
              {preview.conflicts.map((c) => (
                <tr key={c.roomId}>
                  <td>
                    <strong>{c.roomName}</strong>
                    <span className="conflicts__site">{c.siteName}</span>
                  </td>
                  <td className="mono">{`R${pad2(c.local.revision)} ${STATE_LABEL[c.local.state]}`}</td>
                  <td className="mono">{`R${pad2(c.incoming.revision)} ${STATE_LABEL[c.incoming.state]}`}</td>
                  <td>
                    <div className="seg seg--compact" role="group" aria-label={`${c.roomName} choice`}>
                      <button type="button" aria-label={`${c.roomName}: keep mine`} aria-pressed={!take.has(c.roomId)} onClick={() => choose(c.roomId, false)}>
                        Keep mine
                      </button>
                      <button type="button" aria-label={`${c.roomName}: take incoming`} aria-pressed={take.has(c.roomId)} onClick={() => choose(c.roomId, true)}>
                        Take incoming
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
        {mode === 'merge' && preview.conflicts.length > 0 ? <p className="dialog__note">Keep mine leaves that Room exactly as it is in this browser.</p> : null}
        {error ? (
          <p role="alert" className="field__error">
            {error}
          </p>
        ) : null}
        <div className="dialog__actions">
          <button type="button" className="btn btn--ink" onClick={confirm}>
            Import
          </button>
          <button type="button" className="btn btn--quiet" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
```

`apps/web/src/features/handoff/handoff.css`:
```css
.dialog-backdrop {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgb(14 24 36 / 0.28);
  -webkit-backdrop-filter: blur(3px);
  backdrop-filter: blur(3px);
}

.dialog {
  width: min(680px, 100%);
  max-height: 100%;
  overflow-y: auto;
  padding: 22px 24px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  background: rgb(247 249 251 / 0.92);
}

.dialog h2 {
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.dialog__meta,
.dialog__note {
  font-size: 13px;
  color: var(--ink-2);
}

.dialog__actions {
  display: flex;
  gap: 8px;
}

.conflicts {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.conflicts th {
  text-align: left;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--ink-2);
  padding: 6px 8px;
  border-bottom: 1px solid var(--line-strong);
}

.conflicts td {
  padding: 8px;
  border-bottom: 1px solid var(--line);
  vertical-align: middle;
}

.conflicts__site {
  display: block;
  font-size: 12px;
  color: var(--ink-2);
}
```

In `apps/web/src/features/tree/ProjectTree.tsx`:
- Add imports: `import { currentRevision, newId, parseProjectFile, type ProjectFile, type WorkspaceCommand } from '@glasshouse/domain';` (replacing the existing domain import), `import { useRef, useState } from 'react';`, `import { readJsonFile } from '../../ui/files';`, `import { IconPlus, IconUpload } from '../../ui/icons';` and `import { ImportDialog } from '../handoff/ImportDialog';`.
- Add state and handler after the existing `useState` calls:
```tsx
  const fileInput = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState<ProjectFile | null>(null);
  const onImportFile = async (file: File | undefined): Promise<void> => {
    if (!file) return;
    const read = await readJsonFile(file);
    if (!read.ok) {
      setError(read.message);
      return;
    }
    const parsed = parseProjectFile(read.value);
    if (!parsed.ok) {
      setError(parsed.error.message);
      return;
    }
    setError(null);
    setImporting(parsed.value);
  };
```
- Replace the header block with:
```tsx
      <div className="tree__head">
        <h2>Projects</h2>
        <span className="tree__head-actions">
          <button type="button" className="icon-btn" aria-label="Import project file" title="Import project file" onClick={() => fileInput.current?.click()}>
            <IconUpload />
          </button>
          <button type="button" className="icon-btn" aria-label="New project" title="New project" onClick={addProject}>
            <IconPlus />
          </button>
        </span>
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          hidden
          aria-label="Choose a project file"
          onChange={(e) => {
            void onImportFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </div>
```
- Just before the catalog `Link`, render `{importing ? <ImportDialog file={importing} onClose={() => setImporting(null)} /> : null}`.

Append to `apps/web/src/features/tree/tree.css`:
```css
.tree__head-actions {
  display: flex;
  gap: 6px;
}
```

In `apps/web/src/app/TitleBlock.tsx`:
- Add imports: `import { currentRevision, exportProjectFile } from '@glasshouse/domain';` (merging with the existing import), `import { useState } from 'react';`, `import { downloadJson, slugify } from '../ui/files';` and `import { IconDownload } from '../ui/icons';` (merging with `GlasshouseMark`).
- Inside the component, after `const save = …`:
```tsx
  const workspace = useWorkspaceStore((s) => s.workspace);
  const [exportError, setExportError] = useState<string | null>(null);
  const exportProject = (): void => {
    if (!location) return;
    const file = exportProjectFile(workspace, location.project.id, new Date().toISOString());
    if (!file.ok) {
      setExportError(file.error.message);
      return;
    }
    setExportError(null);
    downloadJson(`${slugify(location.project.name)}.glasshouse.json`, file.value);
  };
```
- In `title-block__actions`, before `<SaveStatus save={save} />`, add:
```tsx
        {location ? (
          <button type="button" className="btn btn--sm" onClick={exportProject}>
            <IconDownload />
            Export project file
          </button>
        ) : null}
        {exportError ? (
          <span role="alert" className="save-status save-status--failed">
            {exportError}
          </span>
        ) : null}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm --filter @glasshouse/web test && pnpm --filter @glasshouse/web typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(web): project file export and import with per-room conflict choices

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Workspace backup, restore and reminder

**Files:**
- Create: `apps/web/src/features/tree/BackupPanel.tsx`
- Modify: `apps/web/src/features/tree/ProjectTree.tsx`, `apps/web/src/features/tree/tree.css`
- Test: `apps/web/src/features/tree/BackupPanel.test.tsx`

**Interfaces:**
- Consumes: `exportBackup`, `parseBackup`, `backupDue`, `daysSinceBackup`, `downloadJson`, `readJsonFile`, `formatTime`; the store's `replace`.
- Produces: `BackupPanel()` in the tree footer, with "Back up workspace", "Restore…" (hidden input `aria-label="Choose a backup file"`) and an inline confirmation group "Confirm restore" with "Back up current first", "Replace workspace" and "Cancel".

- [ ] **Step 1: Write the failing test**

`apps/web/src/features/tree/BackupPanel.test.tsx`:
```tsx
import { createWorkspace, exportBackup } from '@glasshouse/domain';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { resetWorkspaceStore, useWorkspaceStore } from '../../store/workspaceStore';
import { BackupPanel } from './BackupPanel';

beforeEach(() => {
  resetWorkspaceStore();
  const s = useWorkspaceStore.getState();
  s.setLoad({ kind: 'ready' });
  s.dispatch({ type: 'project/create', id: 'p', name: 'Northgate' });
  URL.createObjectURL = vi.fn(() => 'blob:x');
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => vi.restoreAllMocks());

it('reminds, backs up and records the time', async () => {
  const user = userEvent.setup();
  render(<BackupPanel />);
  expect(screen.getByText('Not backed up yet.')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Back up workspace' }));
  expect(URL.createObjectURL).toHaveBeenCalled();
  expect(useWorkspaceStore.getState().workspace.lastBackupAt).not.toBeNull();
  expect(screen.getByText('Backed up today.')).toBeInTheDocument();
});

it('restores only after confirmation, and a bad file changes nothing', async () => {
  const user = userEvent.setup();
  render(<BackupPanel />);
  const before = useWorkspaceStore.getState().workspace;
  await user.upload(screen.getByLabelText('Choose a backup file'), new File(['{"nope":true}'], 'b.json'));
  expect(await screen.findByRole('alert')).toHaveTextContent("This isn't a Glasshouse workspace backup.");
  expect(useWorkspaceStore.getState().workspace).toBe(before);

  const backup = exportBackup(createWorkspace(), '2026-10-01T00:00:00.000Z');
  await user.upload(screen.getByLabelText('Choose a backup file'), new File([JSON.stringify(backup)], 'b.json'));
  const confirm = await screen.findByRole('group', { name: 'Confirm restore' });
  expect(confirm).toHaveTextContent('0 projects');
  expect(useWorkspaceStore.getState().workspace).toBe(before);
  await user.click(screen.getByRole('button', { name: 'Replace workspace' }));
  expect(useWorkspaceStore.getState().workspace.projects).toEqual([]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @glasshouse/web test`
Expected: FAIL, cannot resolve `./BackupPanel`.

- [ ] **Step 3: Implement**

`apps/web/src/features/tree/BackupPanel.tsx`:
```tsx
import { backupDue, daysSinceBackup, exportBackup, parseBackup, type Workspace } from '@glasshouse/domain';
import { useRef, useState } from 'react';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { downloadJson, readJsonFile } from '../../ui/files';
import { formatTime } from '../../ui/time';

function statusText(ws: Workspace, now: Date): string {
  const days = daysSinceBackup(ws, now);
  if (days === null) return ws.projects.some((p) => !p.isSample) ? 'Not backed up yet.' : 'Nothing to back up yet.';
  if (days === 0) return 'Backed up today.';
  return `${backupDue(ws, now) ? 'No backup for' : 'Backed up'} ${days} ${days === 1 ? 'day' : 'days'}${backupDue(ws, now) ? '.' : ' ago.'}`;
}

export function BackupPanel() {
  const workspace = useWorkspaceStore((s) => s.workspace);
  const readOnly = useWorkspaceStore((s) => s.readOnly);
  const dispatch = useWorkspaceStore((s) => s.dispatch);
  const fileInput = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<Workspace | null>(null);
  const [error, setError] = useState<string | null>(null);
  const now = new Date();
  const due = backupDue(workspace, now);

  const backUp = (): void => {
    const at = new Date().toISOString();
    downloadJson(`glasshouse-backup-${at.slice(0, 10)}.json`, exportBackup(workspace, at));
    setError(dispatch({ type: 'backup/mark', at })?.message ?? null);
  };
  const onFile = async (file: File | undefined): Promise<void> => {
    if (!file) return;
    const read = await readJsonFile(file);
    if (!read.ok) {
      setError(read.message);
      return;
    }
    const parsed = parseBackup(read.value);
    if (!parsed.ok) {
      setError(parsed.error.message);
      return;
    }
    setError(null);
    setPending(parsed.value);
  };
  const restore = (): void => {
    if (!pending) return;
    if (readOnly) {
      setError('This tab is read-only because Glasshouse is open in another tab.');
      return;
    }
    useWorkspaceStore.getState().replace(pending);
    setPending(null);
  };

  return (
    <section className={`backup${due ? ' backup--due' : ''}`} aria-label="Workspace backup">
      <p className="backup__status">
        <strong>{statusText(workspace, now)}</strong>
        {due ? ' This workspace only lives in this browser.' : ''}
      </p>
      <div className="backup__actions">
        <button type="button" className="btn btn--sm" onClick={backUp}>
          Back up workspace
        </button>
        <button type="button" className="btn btn--sm btn--quiet" onClick={() => fileInput.current?.click()}>
          Restore…
        </button>
      </div>
      <input
        ref={fileInput}
        type="file"
        accept=".json,application/json"
        hidden
        aria-label="Choose a backup file"
        onChange={(e) => {
          void onFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      {pending ? (
        <div className="backup__confirm" role="group" aria-label="Confirm restore">
          <p>
            {`Replace everything in this browser with the backup from ${formatTime(pending.lastBackupAt)} (${pending.projects.length} ${pending.projects.length === 1 ? 'project' : 'projects'})? The current workspace will be lost.`}
          </p>
          <div className="backup__actions">
            <button type="button" className="btn btn--sm" onClick={backUp}>
              Back up current first
            </button>
            <button type="button" className="btn btn--sm btn--danger" onClick={restore}>
              Replace workspace
            </button>
            <button type="button" className="btn btn--sm btn--quiet" onClick={() => setPending(null)}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="tree__error">
          {error}
        </p>
      ) : null}
    </section>
  );
}
```

In `apps/web/src/features/tree/ProjectTree.tsx`, add `import { BackupPanel } from './BackupPanel';` and render `<BackupPanel />` just before the catalog `Link`, after the import dialog.

In `apps/web/src/features/tree/tree.css`, change the `.tree__catalog` rule's `margin-top: auto;` to `margin-top: 10px;`, then append:
```css
.backup {
  margin-top: auto;
  padding: 12px 10px 4px;
  border-top: 1px solid var(--line);
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 12px;
}

.backup--due {
  margin-left: 0;
  margin-right: 0;
  padding: 10px 12px;
  border: 1px solid rgb(154 90 0 / 0.3);
  border-radius: var(--radius-control);
  background: var(--warn-bg);
}

.backup--due .backup__status strong {
  color: var(--warn);
}

.backup__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.backup__confirm {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  border-radius: var(--radius-control);
  border: 1px solid rgb(184 50 42 / 0.3);
  background: var(--block-bg);
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm --filter @glasshouse/web test && pnpm --filter @glasshouse/web typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(web): workspace backup, confirmed restore and seven-day reminder

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: M3 end-to-end journeys and verification

**Files:**
- Create: `apps/web/e2e/review.spec.ts`

- [ ] **Step 1: Write the journeys**

`apps/web/e2e/review.spec.ts`:
```ts
import { expect, test, type Page } from '@playwright/test';

async function roomWithServer(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'New project' }).click();
  await page.getByRole('textbox', { name: 'Project name' }).fill('Northgate');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Add site to Northgate' }).click();
  await page.getByRole('textbox', { name: 'Site name' }).fill('Site A');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Add room to Site A' }).click();
  await page.getByRole('textbox', { name: 'Room name' }).fill('MDF-1');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Place rack' }).click();
  const box = await page.getByTestId('footprint').boundingBox();
  if (!box) throw new Error('Footprint not rendered');
  await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.35);
  await page.getByRole('link', { name: 'Elevation' }).click();
  await page.getByRole('button', { name: 'Add Server 2U to RK-01' }).click();
}

test('AC13/AC16: submit, freeze, self-approve, start a new draft', async ({ page }) => {
  await roomWithServer(page);
  await page.getByRole('link', { name: 'Review' }).click();
  await page.getByLabel('Designed by (optional, unverified)').fill('Ploy');
  await page.getByRole('button', { name: 'Submit for review' }).click();
  await page.getByRole('link', { name: 'Plan' }).click();
  await expect(page.getByText(/Revision 01 is In review/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Place rack' })).toHaveCount(0);
  await page.getByRole('link', { name: 'Open review' }).click();
  await page.getByLabel('Reviewer name (unverified)').fill('Ploy');
  await page.getByRole('button', { name: 'Approve revision' }).click();
  await expect(page.getByText('Self-approved')).toBeVisible();
  await page.getByRole('button', { name: 'Start new draft' }).click();
  await expect(page.getByText('R02 DRAFT')).toBeVisible();
});

test('AC14: an unknown reserved range blocks approval until acknowledged', async ({ page }) => {
  await roomWithServer(page);
  await page.getByRole('button', { name: 'RK-01', exact: true }).click();
  await page.getByRole('button', { name: 'Add reserved range' }).click();
  await page.getByRole('link', { name: 'Review' }).click();
  await page.getByRole('button', { name: 'Submit for review' }).click();
  await expect(page.getByRole('button', { name: 'Approve revision' })).toBeDisabled();
  await page.getByLabel('Why is it acceptable?').fill('Customer will not share figures');
  await page.getByLabel('Your name (unverified)').fill('Somchai');
  await page.getByRole('button', { name: 'Acknowledge' }).click();
  await page.getByLabel('Reviewer name (unverified)').fill('Somchai');
  await expect(page.getByRole('button', { name: 'Approve revision' })).toBeEnabled();
  await page.getByRole('button', { name: 'Approve revision' }).click();
  await expect(page.getByText('R01 APPROVED')).toBeVisible();
});

test('AC15: export a project file, change the room, import and take incoming', async ({ page }) => {
  await roomWithServer(page);
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export project file' }).click();
  const file = await (await downloading).path();
  await page.getByRole('link', { name: 'Plan' }).click();
  await page.getByLabel('Width', { exact: true }).fill('7');
  await page.getByRole('button', { name: 'Import project file' }).click();
  await page.getByLabel('Choose a project file').setInputFiles(file);
  const dialog = page.getByRole('dialog', { name: 'Import “Northgate”' });
  await expect(dialog).toContainText('1 room already here');
  await page.getByRole('button', { name: 'MDF-1: take incoming' }).click();
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(page.getByLabel('Width', { exact: true })).toHaveValue('5.00');
});

test('backup reminder, backup and confirmed restore', async ({ page }) => {
  await roomWithServer(page);
  await expect(page.getByText('Not backed up yet.')).toBeVisible();
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Back up workspace' }).click();
  const backup = await (await downloading).path();
  await expect(page.getByText('Backed up today.')).toBeVisible();
  await page.getByRole('button', { name: 'Delete Northgate' }).click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByLabel('Choose a backup file').setInputFiles(backup);
  await page.getByRole('button', { name: 'Replace workspace' }).click();
  await expect(page.getByRole('link', { name: /MDF-1/ })).toBeVisible();
});
```

- [ ] **Step 2: Run everything**

Run:
```bash
cd /Users/snatchanon/workspace/operations/development/glasshouse
pnpm test && pnpm typecheck && pnpm build && pnpm --filter @glasshouse/domain coverage && pnpm e2e
```
Expected: everything passes, including all M1–M3 journeys (13 tests).

- [ ] **Step 3: Browser look**

With `pnpm dev`, take screenshots of:
- the Review tab In review with a blocker and an unknown Reserved range;
- the Review tab after approval, showing the self-approved flag;
- the frozen plan banner;
- the import dialog with a conflict;
- the tree footer with the backup reminder.

Fix layout problems before committing.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "test(e2e): M3 review, hand-off and backup journeys

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## After M3

- Run the whole-branch review, then merge `feat/m3-review-handoff`.
- Write the M4 plan: room 3D (view only), the print-ready Install sheet for Approved Revisions, the Sample Project on first run, a Vercel config with SPA rewrites, and cross-browser E2E.
