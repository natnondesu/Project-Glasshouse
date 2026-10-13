import type { Rack, ReservedRange } from '@glasshouse/domain';
import type { CommitFn } from '../../store/hooks';
import { DemandField } from '../../ui/DemandField';
import { NumberField } from '../../ui/NumberField';
import { TextField } from '../../ui/TextField';

interface ReservedInspectorProps {
  rack: Rack;
  range: ReservedRange;
  commit: CommitFn;
  onSelect: (id: string | null) => void;
}

export function ReservedInspector({ rack, range, commit, onSelect }: ReservedInspectorProps) {
  const update = (patch: Partial<Omit<ReservedRange, 'id'>>, k?: string): string | null =>
    commit({ type: 'reserved/update', id: range.id, patch }, k === undefined ? undefined : `rsv:${range.id}:${k}`);
  return (
    <div className="inspector__body">
      <header className="inspector__head">
        <h2>Reserved range</h2>
        <span className="inspector__hint">{rack.name}</span>
      </header>
      <p className="inspector__note">Space taken by hardware Glasshouse does not model, such as existing customer gear.</p>
      <fieldset className="inspector__group">
        <legend className="visually-hidden">Reserved range</legend>
        <TextField id={`${range.id}-label`} label="Label" value={range.label} onCommit={(v) => update({ label: v }, 'label')} />
        <div className="field-pair">
          <NumberField id={`${range.id}-u`} label="Bottom U" decimals={0} value={range.bottomU} onCommit={(v) => (v === null ? null : update({ bottomU: v }, 'u'))} />
          <NumberField id={`${range.id}-h`} label="Height" unit="U" decimals={0} value={range.heightU} onCommit={(v) => (v === null ? null : update({ heightU: v }, 'h'))} />
        </div>
        <DemandField
          id={`${range.id}-demand`}
          label="Demand"
          value={range.demand}
          onCommit={(d) => update({ demand: d })}
          unknownHint="Allowed, but a reviewer must acknowledge it with a reason before approval."
        />
        <TextField id={`${range.id}-notes`} label="Notes" multiline value={range.notes} onCommit={(v) => update({ notes: v }, 'notes')} />
      </fieldset>
      <div className="inspector__danger">
        <button
          type="button"
          className="btn btn--sm btn--danger"
          onClick={() => {
            if (commit({ type: 'reserved/remove', id: range.id }) === null) onSelect(rack.id);
          }}
        >
          Remove reserved range
        </button>
      </div>
    </div>
  );
}
