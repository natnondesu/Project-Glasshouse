import type { Demand } from '@glasshouse/domain';
import { useEffect, useState } from 'react';
import { NumberField } from './NumberField';
import { useT } from '../i18n';
import './fields.css';

interface DemandFieldProps {
  id: string;
  label: string;
  value: Demand;
  onCommit: (value: Demand) => string | null;
  unknownHint?: string;
}

/** Unknown is a deliberate choice, never an empty number: switching to Known commits nothing until watts are typed. */
export function DemandField({ id, label, value, onCommit, unknownHint }: DemandFieldProps) {
  const m = useT();
  const [mode, setMode] = useState<Demand['kind']>(value.kind);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setMode(value.kind), [value.kind]);

  const choose = (next: Demand['kind']): void => {
    if (next === 'known') {
      setMode('known');
      setError(null);
      return;
    }
    const problem = onCommit({ kind: 'unknown' });
    setError(problem);
    if (problem === null) setMode('unknown');
  };

  return (
    <div className="field">
      <span className="field__label" id={`${id}-label`}>
        {label}
      </span>
      <div className="seg seg--compact" role="group" aria-labelledby={`${id}-label`}>
        <button type="button" aria-pressed={mode === 'known'} onClick={() => choose('known')}>
          {m.fields.known}
        </button>
        <button type="button" aria-pressed={mode === 'unknown'} onClick={() => choose('unknown')}>
          {m.fields.unknown}
        </button>
      </div>
      {mode === 'known' ? (
        <NumberField
          id={id}
          label={m.fields.inWatts(label)}
          unit="W"
          decimals={0}
          value={value.kind === 'known' ? value.watts : null}
          onCommit={(watts) => (watts === null ? null : onCommit({ kind: 'known', watts }))}
        />
      ) : (
        <p className="field__hint">{unknownHint ?? m.fields.unknownBlocks}</p>
      )}
      {error ? <p className="field__error">{error}</p> : null}
    </div>
  );
}
