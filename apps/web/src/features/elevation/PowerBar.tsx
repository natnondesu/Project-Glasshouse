import { formatWatts, roomPower, type PlanContent } from '@glasshouse/domain';

import { useT } from '../../i18n';

const BAR_W = 1000;

export function PowerBar({ content }: { content: PlanContent }) {
  const m = useT();
  const p = roomPower(content);
  const max = Math.max(p.budgetW, p.knownW, 1);
  const x = (w: number): number => Math.min(BAR_W, (w / max) * BAR_W);
  const unknownParts = [
    p.unknownDevices ? m.power.unknownDevices(p.unknownDevices) : '',
    p.unknownReserved ? m.power.unknownReserved(p.unknownReserved) : '',
  ].filter(Boolean);
  return (
    <section className="power glass" aria-labelledby="power-h">
      <div className="power__head">
        <h2 id="power-h">{m.power.title}</h2>
        <span className={`mono power__known${p.overLimit ? ' power__known--over' : ''}`}>{m.power.known(formatWatts(p.knownW))}</span>
        <span className="power__of">{m.power.ofLimit(formatWatts(p.limitW), p.limitPct, formatWatts(p.budgetW))}</span>
        {unknownParts.length ? <span className="power__unknown">{unknownParts.join(' · ')}</span> : null}
      </div>
      <svg className="power__bar" viewBox={`0 0 ${BAR_W} 18`} preserveAspectRatio="none" role="img" aria-label={m.power.bar(p.knownW, p.limitW, p.budgetW)}>
        <rect x={0} y={4} width={BAR_W} height={10} rx={5} className="power__track" />
        <rect x={0} y={4} width={x(p.knownW)} height={10} rx={5} className={p.overLimit ? 'power__fill power__fill--over' : 'power__fill'} />
        <line x1={x(p.limitW)} x2={x(p.limitW)} y1={0} y2={18} className="power__limit" />
      </svg>
    </section>
  );
}
