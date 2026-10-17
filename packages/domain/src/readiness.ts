import { checkPlan, type Issue } from './checks/index';
import type { IssueCode } from './checks/types';
import { racksOf } from './devices';
import { currentRevision } from './lookup';
import type { Id, Plan, Revision } from './model/types';

export const acknowledgedIds = (revision: Revision): Set<Id> => new Set(revision.acknowledgements.map((a) => a.reservedRangeId));

export const revisionIssues = (revision: Revision): Issue[] => checkPlan(revision.content, acknowledgedIds(revision));

export interface Blocker {
  code: IssueCode | 'no_devices';
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
  return [
    ...(noDevices ? [{ code: 'no_devices' as const, params: {}, message: 'Add at least one Device before approval.' }] : []),
    ...issues,
  ];
}

export const approvalBlockers = (plan: Plan): string[] => approvalBlockerItems(plan).map((b) => b.message);

export const isSelfApproved = (revision: Revision): boolean => {
  const d = revision.designedBy;
  const a = revision.approvedBy;
  if (d === null || a === null) return false;
  if (d.userId && a.userId) return d.userId === a.userId;
  return d.name.trim().toLowerCase() === a.name.trim().toLowerCase();
};

/** The Revision an Install sheet prints: the newest Approved one, even after a new Draft has started. */
export const latestApproved = (plan: Plan): Revision | null => [...plan.revisions].reverse().find((r) => r.state === 'approved') ?? null;
