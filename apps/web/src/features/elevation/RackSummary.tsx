import { formatMetres, formatWatts, lowestFreeBottomU, newId, rackPower, usedU, type Rack } from '@glasshouse/domain';
import { useState } from 'react';
import { Link } from 'react-router';
import type { CommitFn } from '../../store/hooks';
import { useT } from '../../i18n';

interface RackSummaryProps {
  rack: Rack;
  roomId: string;
  commit: CommitFn;
  onSelect: (id: string | null) => void;
}

export function RackSummary({ rack, roomId, commit, onSelect }: RackSummaryProps) {
  const [error, setError] = useState<string | null>(null);
  const m = useT();
  const power = rackPower(rack);
  const unknown = m.elevation.unknownSuffix;

  const addReserved = (): void => {
    const bottomU = lowestFreeBottomU(rack, 1);
    if (bottomU === null) {
      setError(m.rackSummary.noFreeU(rack.name));
      return;
    }
    const id = newId();
    const problem = commit({ type: 'reserved/add', rackId: rack.id, range: { id, label: m.rackSummary.defaultReservedLabel, bottomU, heightU: 1, demand: { kind: 'unknown' }, notes: '' } });
    setError(problem);
    if (problem === null) onSelect(id);
  };

  return (
    <div className="inspector__body">
      <header className="inspector__head">
        <h2 className="mono">{rack.name}</h2>
        <span className="inspector__hint">{`${m.rackSummary.rack} · ${m.inspector.ownerName[rack.owner]}`}</span>
      </header>
      <dl className="equip__facts">
        <dt>{m.rackSummary.occupied}</dt>
        <dd className="mono">{`${usedU(rack)} / ${rack.capacityU}U`}</dd>
        <dt>{m.rackSummary.usableDepth}</dt>
        <dd className="mono">{rack.usableDepthMm} mm</dd>
        {rack.wallBottomM !== undefined ? (
          <>
            <dt>{m.inspector.mounting}</dt>
            <dd className="mono">{m.elevation.wallMounted(formatMetres(rack.wallBottomM))}</dd>
          </>
        ) : null}
        <dt>{m.rackSummary.devices}</dt>
        <dd className="mono">{`${formatWatts(power.devices.knownW)}${unknown(power.devices.unknownCount)}`}</dd>
        <dt>{m.rackSummary.reserved}</dt>
        <dd className="mono">{`${formatWatts(power.reserved.knownW)}${unknown(power.reserved.unknownCount)}`}</dd>
      </dl>
      <p className="inspector__note">{m.rackSummary.note}</p>
      <div className="equip__actions">
        <button type="button" className="btn btn--sm" onClick={addReserved}>
          {m.rackSummary.addReserved}
        </button>
        <Link className="btn btn--sm btn--quiet" to={`/rooms/${roomId}/plan?sel=${rack.id}`}>
          {m.rackSummary.editOnPlan}
        </Link>
      </div>
      {error ? (
        <p role="alert" className="field__error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
