import { formatWatts, roomPower, type PlanContent } from '@glasshouse/domain';
import type { ReactNode } from 'react';
import { useT } from '../../i18n';

const BAR_W = 1000;

/**
 * Room demand as one slim strip above the racks: the total against the design limit, a thin bar,
 * any unknowns, then `children` (the state legend). The full limit wording is in the hover title.
 */
export function PowerBar({ content, children }: { content: PlanContent; children?: ReactNode }) {
  const m = useT();
  const p = roomPower(content);
  const max = Math.max(p.budgetW, p.knownW, 1);
  const x = (w: number): number => Math.min(BAR_W, (w / max) * BAR_W);
  const unknownParts = [
    p.unknownDevices ? m.power.unknownDevices(p.unknownDevices) : '',
    p.unknownReserved ? m.power.unknownReserved(p.unknownReserved) : '',
  ].filter(Boolean);
  return (
    <section className="power glass" aria-labelledby="power-h" title={m.power.ofLimit(formatWatts(p.limitW), p.limitPct, formatWatts(p.budgetW))}>
      <h2 id="power-h">{m.power.title}</h2>
      <span className="power__figures">
        <span className={`mono power__known${p.overLimit ? ' power__known--over' : ''}`}>{formatWatts(p.knownW)}</span>
        <span className="power__of">{m.power.ofShort(formatWatts(p.limitW))}</span>
      </span>
      <svg className="power__bar" viewBox={`0 0 ${BAR_W} 12`} preserveAspectRatio="none" role="img" aria-label={m.power.bar(p.knownW, p.limitW, p.budgetW)}>
        <rect x={0} y={3} width={BAR_W} height={6} rx={3} className="power__track" />
        <rect x={0} y={3} width={x(p.knownW)} height={6} rx={3} className={p.overLimit ? 'power__fill power__fill--over' : 'power__fill'} />
        <line x1={x(p.limitW)} x2={x(p.limitW)} y1={0} y2={12} className="power__limit" />
      </svg>
      {unknownParts.length ? <span className="power__unknown">{unknownParts.join(' · ')}</span> : null}
      {children ? <span className="power__extra">{children}</span> : null}
    </section>
  );
}
