import type { Id, Issue, IssueCode } from '@glasshouse/domain';

/** For these codes the first target is the culprit; the rest give context (e.g. the rack whose clearance is blocked). */
const CULPRIT_ONLY: ReadonlySet<IssueCode> = new Set(['clearance_obstructed', 'clearance_outside_footprint', 'demand_unknown', 'device_too_deep']);

export function flaggedObjectIds(issues: Issue[]): Set<Id> {
  const ids = new Set<Id>();
  for (const issue of issues) {
    if (issue.severity !== 'block') continue;
    const targets = CULPRIT_ONLY.has(issue.code) ? issue.targets.slice(0, 1) : issue.targets;
    for (const id of targets) ids.add(id);
  }
  return ids;
}
