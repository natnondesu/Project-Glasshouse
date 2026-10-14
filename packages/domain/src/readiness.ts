import { checkPlan, type Issue } from './checks/index';
import type { IssueCode } from './checks/types';
import { racksOf } from './devices';
import { currentRevision } from './lookup';
import type { Id, Plan, Revision } from './model/types';

export const acknowledgedIds = (revision: Revision): Set<Id> => new Set(revision.acknowledgements.map((a) => a.reservedRangeId));

export const revisionIssues = (revision: Revision): Issue[] => checkPlan(revision.content, acknowledgedIds(revision));

export interface Blocker {
  code: IssueCode | 'no_devices' | 'open_notes';
  params: Record<string, string | number>;
  /** English wording, also used by the approve command's refusal. */
  message: string;
}

/** Everything that must change before the current Revision can be approved, structured so the UI can word it in any language. */
export function approvalBlockerItems(plan: Plan): Blocker[] {
  const revision = currentRevision(plan);
  const noDevices = racksOf(revision.content).every((r) => r.devices.length === 0);
  const issues: Blocker[] = revisionIssues(revision)
    .filter((i) => i.severity === 'block' || i.severity === 'needs_ack')
    .map((i) => ({ code: i.code, params: i.params, message: i.message }));
  const openNotes = plan.notes.filter((n) => !n.resolved).length;
  return [
    ...(noDevices ? [{ code: 'no_devices' as const, params: {}, message: 'Add at least one Device before approval.' }] : []),
    ...issues,
    ...(openNotes > 0 ? [{ code: 'open_notes' as const, params: { count: openNotes }, message: `${openNotes} review ${openNotes === 1 ? 'note is' : 'notes are'} unresolved.` }] : []),
  ];
}

export const approvalBlockers = (plan: Plan): string[] => approvalBlockerItems(plan).map((b) => b.message);

export const isSelfApproved = (revision: Revision): boolean =>
  revision.designedBy !== null &&
  revision.approvedBy !== null &&
  revision.designedBy.name.trim().toLowerCase() === revision.approvedBy.name.trim().toLowerCase();

/** The Revision an Install sheet prints: the newest Approved one, even after a new Draft has started. */
export const latestApproved = (plan: Plan): Revision | null => [...plan.revisions].reverse().find((r) => r.state === 'approved') ?? null;
