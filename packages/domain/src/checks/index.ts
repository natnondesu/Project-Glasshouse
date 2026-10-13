import type { PlanContent } from '../model/types';
import { placementIssues } from './placement';
import type { Issue, Severity } from './types';

export * from './types';
export { placementIssues } from './placement';

const ORDER: Record<Severity, number> = { block: 0, needs_ack: 1, warn: 2 };

export function checkPlan(content: PlanContent): Issue[] {
  return [...placementIssues(content)].sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);
}

export const blockingIssues = (issues: Issue[]): Issue[] => issues.filter((i) => i.severity === 'block');
