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

/** The Revision an Install sheet prints: the newest Approved one, even after a new Draft has started. */
export const latestApproved = (plan: Plan): Revision | null => [...plan.revisions].reverse().find((r) => r.state === 'approved') ?? null;
