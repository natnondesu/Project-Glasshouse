import { formatWatts, roomPower, type PlanContent } from '@glasshouse/domain';

const BAR_W = 1000;

export function PowerBar({ content }: { content: PlanContent }) {
  const p = roomPower(content);
  const max = Math.max(p.budgetW, p.knownW, 1);
  const x = (w: number): number => Math.min(BAR_W, (w / max) * BAR_W);
  const unknownParts = [
    p.unknownDevices ? `${p.unknownDevices} unknown ${p.unknownDevices === 1 ? 'Device' : 'Devices'}` : '',
    p.unknownReserved ? `${p.unknownReserved} unknown Reserved ${p.unknownReserved === 1 ? 'range' : 'ranges'}` : '',
  ].filter(Boolean);
  return (
    <section className="power glass" aria-labelledby="power-h">
      <div className="power__head">
        <h2 id="power-h">Room demand</h2>
        <span className={`mono power__known${p.overLimit ? ' power__known--over' : ''}`}>{`${formatWatts(p.knownW)} known`}</span>
        <span className="power__of">
          of <span className="mono">{formatWatts(p.limitW)}</span> design limit ({p.limitPct}% of <span className="mono">{formatWatts(p.budgetW)}</span>)
        </span>
        {unknownParts.length ? <span className="power__unknown">{unknownParts.join(' · ')}</span> : null}
      </div>
      <svg className="power__bar" viewBox={`0 0 ${BAR_W} 18`} preserveAspectRatio="none" role="img" aria-label={`${p.knownW} watts known of a ${p.limitW} watt design limit and ${p.budgetW} watt budget`}>
        <rect x={0} y={4} width={BAR_W} height={10} rx={5} className="power__track" />
        <rect x={0} y={4} width={x(p.knownW)} height={10} rx={5} className={p.overLimit ? 'power__fill power__fill--over' : 'power__fill'} />
        <line x1={x(p.limitW)} x2={x(p.limitW)} y1={0} y2={18} className="power__limit" />
      </svg>
    </section>
  );
}
