import type { RevisionState } from '@glasshouse/domain';
import { useT } from '../i18n';

export const pad2 = (n: number): string => String(n).padStart(2, '0');

export function StatusStamp({ state }: { state: RevisionState }) {
  const m = useT();
  return <span className={`status-stamp status-stamp--${state}`}>{m.revision.stamp[state]}</span>;
}
