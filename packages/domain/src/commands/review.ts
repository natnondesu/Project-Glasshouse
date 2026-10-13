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
