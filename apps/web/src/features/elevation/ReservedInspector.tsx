import type { Rack, ReservedRange } from '@glasshouse/domain';
import type { CommitFn } from '../../store/hooks';
import { DemandField } from '../../ui/DemandField';
import { NumberField } from '../../ui/NumberField';
import { TextField } from '../../ui/TextField';
import { useT } from '../../i18n';
import { confirmAction } from '../../ui/confirm/confirmStore';

interface ReservedInspectorProps {
  rack: Rack;
  range: ReservedRange;
  commit: CommitFn;
  onSelect: (id: string | null) => void;
}

export function ReservedInspector({ rack, range, commit, onSelect }: ReservedInspectorProps) {
  const m = useT();
  const update = (patch: Partial<Omit<ReservedRange, 'id'>>, k?: string): string | null =>
    commit({ type: 'reserved/update', id: range.id, patch }, k === undefined ? undefined : `rsv:${range.id}:${k}`);
  return (
    <div className="inspector__body">
      <header className="inspector__head">
        <h2>{m.reserved.title}</h2>
        <span className="inspector__hint">{rack.name}</span>
      </header>
      <p className="inspector__note">{m.reserved.note}</p>
      <fieldset className="inspector__group">
        <legend className="visually-hidden">{m.reserved.title}</legend>
        <TextField id={`${range.id}-label`} label={m.reserved.label} value={range.label} onCommit={(v) => update({ label: v }, 'label')} />
        <div className="field-pair">
          <NumberField id={`${range.id}-u`} label={m.reserved.bottomU} decimals={0} commitOn="blur" value={range.bottomU} onCommit={(v) => (v === null ? null : update({ bottomU: v }, 'u'))} />
          <NumberField id={`${range.id}-h`} label={m.reserved.height} unit="U" decimals={0} commitOn="blur" value={range.heightU} onCommit={(v) => (v === null ? null : update({ heightU: v }, 'h'))} />
        </div>
        <DemandField
          id={`${range.id}-demand`}
          label={m.reserved.demand}
          value={range.demand}
          onCommit={(d) => update({ demand: d }, 'demand')}
          unknownHint={m.reserved.unknownHint}
        />
        <TextField id={`${range.id}-notes`} label={m.reserved.notes} multiline value={range.notes} onCommit={(v) => update({ notes: v }, 'notes')} />
      </fieldset>
      <div className="inspector__danger">
        <button
          type="button"
          className="btn btn--sm btn--danger"
          onClick={() =>
            void confirmAction({ title: m.reserved.removeQuestion(range.label), body: m.confirmRemove.undo, confirmLabel: m.confirmRemove.action }).then((ok) => {
              if (ok && commit({ type: 'reserved/remove', id: range.id }) === null) onSelect(rack.id);
            })
          }
        >
          {m.reserved.remove}
        </button>
      </div>
    </div>
  );
}
