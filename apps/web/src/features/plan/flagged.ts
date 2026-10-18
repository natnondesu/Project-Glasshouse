import type { Id, Issue, IssueCode } from '@glasshouse/domain';

/** For these codes the first target is the culprit; the rest give context (e.g. the rack whose clearance is blocked). */
export const CULPRIT_ONLY: ReadonlySet<IssueCode> = new Set(['clearance_obstructed', 'clearance_outside_footprint', 'demand_unknown', 'device_too_deep']);

export function flaggedObjectIds(issues: Issue[]): Set<Id> {
  const ids = new Set<Id>();
  for (const issue of issues) {
    if (issue.severity !== 'block') continue;
    const targets = CULPRIT_ONLY.has(issue.code) ? issue.targets.slice(0, 1) : issue.targets;
    for (const id of targets) ids.add(id);
  }
  return ids;
}

/** Warnings about air conditioning and display walls: advice, so the objects they name are marked rather than blocked. */
const ENVIRONMENT_CODES: ReadonlySet<IssueCode> = new Set(['wall_ac_drip', 'wall_ac_airflow', 'precision_ac_service', 'display_wall_view']);
/** The ones about a zone in front of a unit: the zone is drawn while one of them stands. */
const ZONE_CODES: ReadonlySet<IssueCode> = new Set(['wall_ac_airflow', 'precision_ac_service', 'display_wall_view']);

export function warnedObjectIds(issues: Issue[], codes: ReadonlySet<IssueCode> = ENVIRONMENT_CODES): Set<Id> {
  return new Set(issues.filter((i) => codes.has(i.code)).flatMap((i) => i.targets));
}

export const zoneWarnedObjectIds = (issues: Issue[]): Set<Id> => warnedObjectIds(issues, ZONE_CODES);
