import type { PlanContent } from '../model/types';
import { equipmentIssues } from './equipment';
import { feedIssues } from './feeds';
import { placementIssues } from './placement';
import type { Issue, Severity } from './types';

export * from './types';
export { placementIssues } from './placement';
export { equipmentIssues } from './equipment';

const ORDER: Record<Severity, number> = { block: 0, needs_ack: 1, warn: 2 };

export function checkPlan(content: PlanContent, acknowledged: ReadonlySet<string> = new Set()): Issue[] {
  return [...placementIssues(content), ...equipmentIssues(content, acknowledged), ...feedIssues(content)].sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);
}

export const blockingIssues = (issues: Issue[]): Issue[] => issues.filter((i) => i.severity === 'block');
