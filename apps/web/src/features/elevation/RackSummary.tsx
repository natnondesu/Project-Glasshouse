import { formatWatts, lowestFreeBottomU, newId, rackPower, usedU, type Rack } from '@glasshouse/domain';
import { useState } from 'react';
import { Link } from 'react-router';
import type { CommitFn } from '../../store/hooks';

interface RackSummaryProps {
  rack: Rack;
  roomId: string;
  commit: CommitFn;
  onSelect: (id: string | null) => void;
}

export function RackSummary({ rack, roomId, commit, onSelect }: RackSummaryProps) {
  const [error, setError] = useState<string | null>(null);
  const power = rackPower(rack);
  const unknown = (n: number): string => (n ? ` + ${n} unknown` : '');

  const addReserved = (): void => {
    const bottomU = lowestFreeBottomU(rack, 1);
    if (bottomU === null) {
      setError(`${rack.name} has no free U for a reserved range.`);
      return;
    }
    const id = newId();
    const problem = commit({ type: 'reserved/add', rackId: rack.id, range: { id, label: 'Reserved', bottomU, heightU: 1, demand: { kind: 'unknown' }, notes: '' } });
    setError(problem);
    if (problem === null) onSelect(id);
  };

  return (
    <div className="inspector__body">
      <header className="inspector__head">
        <h2 className="mono">{rack.name}</h2>
        <span className="inspector__hint">Rack · {rack.owner === 'customer' ? 'Customer' : 'OxygenAI'}</span>
      </header>
      <dl className="equip__facts">
        <dt>Occupied</dt>
        <dd className="mono">{`${usedU(rack)} / ${rack.capacityU}U`}</dd>
        <dt>Usable depth</dt>
        <dd className="mono">{rack.usableDepthMm} mm</dd>
        <dt>Devices</dt>
        <dd className="mono">{`${formatWatts(power.devices.knownW)}${unknown(power.devices.unknownCount)}`}</dd>
        <dt>Reserved</dt>
        <dd className="mono">{`${formatWatts(power.reserved.knownW)}${unknown(power.reserved.unknownCount)}`}</dd>
      </dl>
      <p className="inspector__note">Drag a Template onto the rack or use Add in the Catalog. Select a Device to edit it.</p>
      <div className="equip__actions">
        <button type="button" className="btn btn--sm" onClick={addReserved}>
          Add reserved range
        </button>
        <Link className="btn btn--sm btn--quiet" to={`/rooms/${roomId}/plan?sel=${rack.id}`}>
          Edit rack on the plan
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
