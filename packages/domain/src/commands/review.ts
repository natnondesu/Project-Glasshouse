import { castDraft, produce, type Draft } from 'immer';
import { findReserved } from '../devices';
import { createDraftRevision } from '../factories';
import { currentRevision } from '../lookup';
import { LIMITS } from '../model/defaults';
import type { Id, Plan, Revision, UnverifiedName } from '../model/types';
import { approvalBlockers } from '../readiness';
import { err, ok, type Failure, type Result } from '../result';
import { validateName } from '../validation';

export type ReviewCommand =
  | { type: 'review/submit'; designedBy: string; at: string; byId?: Id }
  | { type: 'review/approve'; reviewer: string; at: string; byId?: Id }
  | { type: 'review/new-draft'; at: string }
  | { type: 'review/discard-draft'; at: string }
  | { type: 'review/acknowledge'; reservedRangeId: Id; reason: string; by: string; at: string; byId?: Id }
  | { type: 'review/unacknowledge'; reservedRangeId: Id; at: string }
  /** A note on a revision (the current one unless named), on any revision, frozen or not: notes never change the design. */
  | { type: 'note/add'; id: Id; text: string; at: string; revision?: number; by?: string; byId?: Id };

const STATE_TEXT: Record<Revision['state'], string> = { draft: 'a Draft', in_review: 'In review', approved: 'approved' };

const lastRevision = (d: Draft<Plan>): Draft<Revision> => {
  const r = d.revisions[d.revisions.length - 1];
  if (!r) throw new Error('Invariant violated: a plan has no revisions.');
  return r;
};

const NAME_MAX_NOTE = 60;
const frozen = (rev: Revision): Failure => err('invalid_value', `Revision ${rev.number} is approved. Start a new draft to change it.`);

/** On the shared server the person is a signed-in user: their id is kept and "(unverified)" goes. */
const person = (name: string, at: string, byId?: Id): UnverifiedName => (byId ? { name, at, userId: byId } : { name, at });
const tail = (byId?: Id): string => (byId ? '' : ' (unverified)');
const verified = (byId?: Id): { verified?: number } => (byId ? { verified: 1 } : {});

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
          r.designedBy = name.value ? person(name.value, cmd.at, cmd.byId) : null;
          d.history.push({ revision: r.number, action: name.value ? `Submitted for review by ${name.value}${tail(cmd.byId)}` : 'Submitted for review', at: cmd.at, code: 'submitted', params: name.value ? { by: name.value, ...verified(cmd.byId) } : {} });
        }),
      );
    }
    case 'review/approve': {
      if (rev.state === 'draft') return err('invalid_value', 'Submit the Draft for review before approving it.');
      if (rev.state === 'approved') return err('invalid_value', `Revision ${rev.number} is already approved.`);
      if (cmd.byId && rev.designedBy?.userId === cmd.byId) {
        return err('forbidden', `You submitted revision ${rev.number}, so another reviewer has to approve it.`);
      }
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
          r.approvedBy = person(reviewer.value, cmd.at, cmd.byId);
          d.history.push({ revision: r.number, action: `Approved by ${reviewer.value}${tail(cmd.byId)}`, at: cmd.at, code: 'approved', params: { by: reviewer.value, ...verified(cmd.byId) } });
        }),
      );
    }
    case 'review/new-draft': {
      if (rev.state === 'draft') return err('invalid_value', `Revision ${rev.number} is already a Draft.`);
      return ok(
        produce(plan, (d) => {
          d.revisions.push(castDraft(createDraftRevision(rev.number + 1, rev.content)));
          d.history.push({ revision: rev.number + 1, action: `Started Draft revision ${rev.number + 1} from revision ${rev.number}`, at: cmd.at, code: 'new_draft', params: { to: rev.number + 1, from: rev.number } });
        }),
      );
    }
    case 'review/discard-draft': {
      if (rev.state !== 'draft') return err('invalid_value', `Revision ${rev.number} is not a Draft.`);
      const back = plan.revisions[plan.revisions.length - 2];
      if (!back) return err('invalid_value', `Revision ${rev.number} is the room's first revision, so there is nothing to go back to.`);
      return ok(
        produce(plan, (d) => {
          d.revisions.pop();
          d.history.push({ revision: rev.number, action: `Discarded Draft revision ${rev.number}; back to revision ${back.number}`, at: cmd.at, code: 'draft_discarded', params: { draft: rev.number, back: back.number } });
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
            { reservedRangeId: cmd.reservedRangeId, reason: reason.value, by: person(by.value, cmd.at, cmd.byId) },
          ];
          d.history.push({ revision: r.number, action: `${by.value}${tail(cmd.byId)} acknowledged unknown demand for ${found.range.label}`, at: cmd.at, code: 'acknowledged', params: { by: by.value, range: found.range.label, ...verified(cmd.byId) } });
        }),
      );
    }
    case 'review/unacknowledge': {
      if (!open) return frozen(rev);
      return ok(
        produce(plan, (d) => {
          const r = lastRevision(d);
          r.acknowledgements = r.acknowledgements.filter((a) => a.reservedRangeId !== cmd.reservedRangeId);
          d.history.push({ revision: r.number, action: 'Withdrew an acknowledgement', at: cmd.at, code: 'unacknowledged' });
        }),
      );
    }
    case 'note/add': {
      const text = validateText(cmd.text, 'Write the note first.', 'A note');
      if (!text.ok) return text;
      if (plan.notes.some((n) => n.id === cmd.id)) return err('invalid_value', 'A note with this ID already exists.', [cmd.id]);
      const on = cmd.revision ?? rev.number;
      if (!plan.revisions.some((r) => r.number === on)) return err('not_found', `There is no revision ${on}.`, []);
      const by = cmd.by?.trim() ?? '';
      if (by.length > NAME_MAX_NOTE) return err('invalid_value', `Names are up to ${NAME_MAX_NOTE} characters.`, []);
      return ok(
        produce(plan, (d) => {
          d.notes.push({ id: cmd.id, text: text.value, revision: on, createdAt: cmd.at, ...(by ? { by } : {}), ...(by && cmd.byId ? { byId: cmd.byId } : {}) });
          d.history.push({ revision: on, action: by ? `${by}${tail(cmd.byId)} added a note` : 'Added a note', at: cmd.at, code: 'note_added', ...(by ? { params: { by, ...verified(cmd.byId) } } : {}) });
        }),
      );
    }
  }
}
