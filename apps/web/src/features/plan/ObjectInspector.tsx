import { formatMetres, rackAutoHeightM, type ObjectPatch, type RoomObject } from '@glasshouse/domain';
import { useState } from 'react';
import { IconRotateCcw, IconRotateCw } from '../../ui/icons';
import { NumberField } from '../../ui/NumberField';
import { TextField } from '../../ui/TextField';
import { describeRackContents, TYPE_LABEL } from './labels';
import type { CommitFn } from './usePlanGestures';

interface ObjectInspectorProps {
  object: RoomObject;
  commit: CommitFn;
  onDeleted: () => void;
}

export function ObjectInspector({ object, commit, onDeleted }: ObjectInspectorProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const update = (patch: ObjectPatch, key?: string): string | null =>
    commit({ type: 'object/update', id: object.id, patch }, key === undefined ? undefined : `obj:${object.id}:${key}`);
  /** For buttons: a rejected command has no field to show its error next to, so surface it in the panel. */
  const act = (run: () => string | null): void => setActionError(run());
  const num = (key: 'x' | 'y' | 'w' | 'd' | 'angle') => (v: number | null) => (v === null ? null : update({ [key]: v }, key));
  const rack = object.type === 'rack' ? object : null;
  const rackContents = rack ? describeRackContents(rack) : null;
  const autoHeight = rack ? rackAutoHeightM(rack.capacityU) : null;

  return (
    <div className="inspector__body">
      <header className="inspector__head">
        <h2 className="mono">{object.name}</h2>
        <span className="inspector__hint">
          {TYPE_LABEL[object.type]}
          {rack ? ` · ${rack.capacityU}U` : ''}
        </span>
      </header>

      <fieldset className="inspector__group">
        <legend className="visually-hidden">Identity</legend>
        <TextField id={`${object.id}-name`} label="Name" value={object.name} onCommit={(v) => update({ name: v }, 'name')} />
        {rack ? (
          <div className="field">
            <span className="field__label">Owner</span>
            <div className="seg" role="group" aria-label="Rack owner">
              {(['oxygenai', 'customer'] as const).map((owner) => (
                <button key={owner} type="button" aria-pressed={rack.owner === owner} onClick={() => act(() => update({ owner }))}>
                  {owner === 'oxygenai' ? 'OxygenAI' : 'Customer'}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </fieldset>

      <fieldset className="inspector__group">
        <legend className="lbl">Placement</legend>
        <div className="field-pair">
          <NumberField id={`${object.id}-x`} label="X" unit="m" value={object.x} onCommit={num('x')} />
          <NumberField id={`${object.id}-y`} label="Y" unit="m" value={object.y} onCommit={num('y')} />
        </div>
        <div className="angle-row">
          <button type="button" className="icon-btn" aria-label="Rotate 45° counter-clockwise" onClick={() => act(() => commit({ type: 'object/rotate', id: object.id, by: -45 }))}>
            <IconRotateCcw />
          </button>
          <button type="button" className="icon-btn" aria-label="Rotate 45° clockwise" onClick={() => act(() => commit({ type: 'object/rotate', id: object.id, by: 45 }))}>
            <IconRotateCw />
          </button>
          <NumberField id={`${object.id}-angle`} label="Angle" unit="°" value={object.angle} onCommit={num('angle')} />
        </div>
        {actionError ? (
          <p role="alert" className="field__error">
            {actionError}
          </p>
        ) : null}
      </fieldset>

      <fieldset className="inspector__group">
        <legend className="lbl">Size</legend>
        <div className="field-pair">
          <NumberField id={`${object.id}-w`} label="Width" unit="m" value={object.w} onCommit={num('w')} />
          <NumberField id={`${object.id}-d`} label="Depth" unit="m" value={object.d} onCommit={num('d')} />
        </div>
        <NumberField
          id={`${object.id}-height`}
          label="Height"
          unit="m"
          allowEmpty
          value={object.height}
          placeholder={autoHeight === null ? 'Default' : `${formatMetres(autoHeight)} from capacity`}
          onCommit={(v) => update({ height: v }, 'height')}
        />
      </fieldset>

      {rack ? (
        <>
          <fieldset className="inspector__group">
            <legend className="lbl">Capacity</legend>
            <div className="field-pair">
              <NumberField id={`${object.id}-u`} label="Capacity" unit="U" decimals={0} value={rack.capacityU} onCommit={(v) => (v === null ? null : update({ capacityU: v }, 'u'))} />
              <NumberField
                id={`${object.id}-depth`}
                label="Usable depth"
                unit="mm"
                decimals={0}
                value={rack.usableDepthMm}
                onCommit={(v) => (v === null ? null : update({ usableDepthMm: v }, 'usable'))}
              />
            </div>
          </fieldset>
          <fieldset className="inspector__group inspector__group--clearance">
            <legend className="lbl">Clearance</legend>
            <div className="field-pair">
              <NumberField
                id={`${object.id}-front`}
                label="Front"
                unit="m"
                value={rack.clearance.front}
                onCommit={(v) => (v === null ? null : update({ clearance: { front: v } }, 'front'))}
              />
              <NumberField
                id={`${object.id}-rear`}
                label="Rear"
                unit="m"
                value={rack.clearance.rear}
                onCommit={(v) => (v === null ? null : update({ clearance: { rear: v } }, 'rear'))}
              />
            </div>
          </fieldset>
        </>
      ) : null}

      <fieldset className="inspector__group">
        <legend className="visually-hidden">Notes</legend>
        <TextField id={`${object.id}-notes`} label="Notes" multiline value={object.notes} onCommit={(v) => update({ notes: v }, 'notes')} />
      </fieldset>

      <div className="inspector__danger">
        {confirmDelete ? (
          <>
            <span>{rackContents ? `Remove ${object.name} and its ${rackContents} from the plan?` : `Remove ${object.name} from the plan?`}</span>
            <button
              type="button"
              className="btn btn--sm btn--danger"
              onClick={() => {
                const problem = commit({ type: 'object/remove', id: object.id });
                setActionError(problem);
                if (problem === null) onDeleted();
              }}
            >
              Remove
            </button>
            <button type="button" className="btn btn--sm btn--quiet" onClick={() => setConfirmDelete(false)}>
              Cancel
            </button>
          </>
        ) : (
          <button type="button" className="btn btn--sm btn--danger" onClick={() => setConfirmDelete(true)}>
            Remove {object.name}
          </button>
        )}
      </div>
    </div>
  );
}
