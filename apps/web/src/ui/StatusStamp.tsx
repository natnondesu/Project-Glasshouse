import type { RevisionState } from '@glasshouse/domain';

export const STATE_LABEL: Record<RevisionState, string> = { draft: 'DRAFT', in_review: 'IN REVIEW', approved: 'APPROVED' };

export const pad2 = (n: number): string => String(n).padStart(2, '0');

export function StatusStamp({ state }: { state: RevisionState }) {
  return <span className={`status-stamp status-stamp--${state}`}>{STATE_LABEL[state]}</span>;
}
