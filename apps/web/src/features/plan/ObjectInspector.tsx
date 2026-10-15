import { formatMetres, isPowerSource, rackAutoHeightM, type ObjectPatch, type PlanContent, type RoomObject } from '@glasshouse/domain';
import { PanelFeeds, RackFeeds } from './feeds';
import { useState } from 'react';
import { IconRotateCcw, IconRotateCw } from '../../ui/icons';
import { NumberField } from '../../ui/NumberField';
import { TextField } from '../../ui/TextField';
import { describeRackContents } from './labels';
import { useT } from '../../i18n';
import type { CommitFn } from './usePlanGestures';

interface ObjectInspectorProps {
  object: RoomObject;
  content: PlanContent;
  commit: CommitFn;
  onManagePanel?: (id: string) => void;
  onDeleted: () => void;
}

export function ObjectInspector({ object, content, commit, onDeleted, onManagePanel }: ObjectInspectorProps) {
  const m = useT();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const update = (patch: ObjectPatch, key?: string): string | null =>
    commit({ type: 'object/update', id: object.id, patch }, key === undefined ? undefined : `obj:${object.id}:${key}`);
  /** For buttons: a rejected command has no field to show its error next to, so surface it in the panel. */
  const act = (run: () => string | null): void => setActionError(run());
  const num = (key: 'x' | 'y' | 'w' | 'd' | 'angle') => (v: number | null) => (v === null ? null : update({ [key]: v }, key));
  const rack = object.type === 'rack' ? object : null;
  const rackContents = rack ? describeRackContents(m, rack) : null;
  const autoHeight = rack ? rackAutoHeightM(rack.capacityU) : null;

  return (
    <div className="inspector__body">
      <header className="inspector__head">
        <h2 className="mono">{object.name}</h2>
        <span className="inspector__hint">
          {m.objects.type[object.type]}
          {rack ? ` · ${rack.capacityU}U` : ''}
        </span>
      </header>

      <fieldset className="inspector__group">
        <legend className="visually-hidden">{m.inspector.identity}</legend>
        <TextField id={`${object.id}-name`} label={m.inspector.name} value={object.name} onCommit={(v) => update({ name: v }, 'name')} />
        {rack ? (
          <div className="field">
            <span className="field__label">{m.inspector.owner}</span>
            <div className="seg" role="group" aria-label={m.inspector.rackOwner}>
              {(['oxygenai', 'customer'] as const).map((owner) => (
                <button key={owner} type="button" aria-pressed={rack.owner === owner} onClick={() => act(() => update({ owner }))}>
                  {m.inspector.ownerName[owner]}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {object.type === 'door' ? (
          <>
            <div className="field">
              <span className="field__label">{m.inspector.doorType}</span>
              <div className="seg" role="group" aria-label={m.inspector.doorType}>
                {(['swing', 'slide'] as const).map((opening) => (
                  <button key={opening} type="button" aria-pressed={(object.opening ?? 'swing') === opening} onClick={() => act(() => update({ opening }))}>
                    {m.inspector.opening[opening]}
                  </button>
                ))}
              </div>
            </div>
            <div className="field">
              <span className="field__label">{object.opening === 'slide' ? m.inspector.slidesTo : m.inspector.hinge}</span>
              <div className="seg" role="group" aria-label={object.opening === 'slide' ? m.inspector.doorSlide : m.inspector.doorHinge}>
                {(['left', 'right'] as const).map((hinge) => (
                  <button key={hinge} type="button" aria-pressed={(object.hinge ?? 'left') === hinge} onClick={() => act(() => update({ hinge }))}>
                    {m.inspector.side[hinge]}
                  </button>
                ))}
              </div>
              <span className="inspector__note">{object.opening === 'slide' ? m.inspector.slideNote : m.inspector.hingeNote}</span>
            </div>
          </>
        ) : null}
      </fieldset>

      <fieldset className="inspector__group">
        <legend className="lbl">{m.inspector.placement}</legend>
        <div className="field-pair">
          <NumberField id={`${object.id}-x`} label="X" unit="m" value={object.x} onCommit={num('x')} />
          <NumberField id={`${object.id}-y`} label="Y" unit="m" value={object.y} onCommit={num('y')} />
        </div>
        <div className="angle-row">
          <button type="button" className="icon-btn" aria-label={m.inspector.rotateCcw} onClick={() => act(() => commit({ type: 'object/rotate', id: object.id, by: -45 }))}>
            <IconRotateCcw />
          </button>
          <button type="button" className="icon-btn" aria-label={m.inspector.rotateCw} onClick={() => act(() => commit({ type: 'object/rotate', id: object.id, by: 45 }))}>
            <IconRotateCw />
          </button>
          <NumberField id={`${object.id}-angle`} label={m.inspector.angle} unit="°" value={object.angle} onCommit={num('angle')} />
        </div>
        {actionError ? (
          <p role="alert" className="field__error">
            {actionError}
          </p>
        ) : null}
      </fieldset>

      <fieldset className="inspector__group">
        <legend className="lbl">{m.inspector.size}</legend>
        <div className="field-pair">
          <NumberField id={`${object.id}-w`} label={m.inspector.width} unit="m" value={object.w} onCommit={num('w')} />
          <NumberField id={`${object.id}-d`} label={m.inspector.depth} unit="m" value={object.d} onCommit={num('d')} />
        </div>
        <NumberField
          id={`${object.id}-height`}
          label={m.inspector.height}
          unit="m"
          allowEmpty
          value={object.height}
          placeholder={autoHeight === null ? m.inspector.heightDefault : m.inspector.heightFromCapacity(formatMetres(autoHeight))}
          onCommit={(v) => update({ height: v }, 'height')}
        />
      </fieldset>

      {rack ? (
        <>
          <fieldset className="inspector__group">
            <legend className="lbl">{m.inspector.capacity}</legend>
            <div className="field-pair">
              <NumberField id={`${object.id}-u`} label={m.inspector.capacity} unit="U" decimals={0} value={rack.capacityU} onCommit={(v) => (v === null ? null : update({ capacityU: v }, 'u'))} />
              <NumberField
                id={`${object.id}-depth`}
                label={m.inspector.usableDepth}
                unit="mm"
                decimals={0}
                value={rack.usableDepthMm}
                onCommit={(v) => (v === null ? null : update({ usableDepthMm: v }, 'usable'))}
              />
            </div>
          </fieldset>
          <fieldset className="inspector__group inspector__group--clearance">
            <legend className="lbl">{m.inspector.clearance}</legend>
            <div className="field-pair">
              <NumberField
                id={`${object.id}-front`}
                label={m.inspector.front}
                unit="m"
                value={rack.clearance.front}
                onCommit={(v) => (v === null ? null : update({ clearance: { front: v } }, 'front'))}
              />
              <NumberField
                id={`${object.id}-rear`}
                label={m.inspector.rear}
                unit="m"
                value={rack.clearance.rear}
                onCommit={(v) => (v === null ? null : update({ clearance: { rear: v } }, 'rear'))}
              />
            </div>
          </fieldset>
        </>
      ) : null}

      {rack ? <RackFeeds rack={rack} content={content} commit={commit} /> : null}
      {isPowerSource(object) ? <PanelFeeds panel={object} content={content} commit={commit} onManage={onManagePanel} /> : null}

      <fieldset className="inspector__group">
        <legend className="visually-hidden">{m.inspector.notes}</legend>
        <TextField id={`${object.id}-notes`} label={m.inspector.notes} multiline value={object.notes} onCommit={(v) => update({ notes: v }, 'notes')} />
      </fieldset>

      <div className="inspector__danger">
        {confirmDelete ? (
          <>
            <span>{m.inspector.removeQuestion(object.name, rackContents)}</span>
            <button
              type="button"
              className="btn btn--sm btn--danger"
              onClick={() => {
                const problem = commit({ type: 'object/remove', id: object.id });
                setActionError(problem);
                if (problem === null) onDeleted();
              }}
            >
              {m.inspector.remove}
            </button>
            <button type="button" className="btn btn--sm btn--quiet" onClick={() => setConfirmDelete(false)}>
              {m.common.cancel}
            </button>
          </>
        ) : (
          <button type="button" className="btn btn--sm btn--danger" onClick={() => setConfirmDelete(true)}>
            {m.inspector.removeObject(object.name)}
          </button>
        )}
      </div>
    </div>
  );
}
