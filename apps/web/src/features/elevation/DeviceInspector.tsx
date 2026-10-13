import { CATEGORY_LABEL, formatURange, type DeviceLocation, type DevicePatch, type Rack, type Template } from '@glasshouse/domain';
import { useState } from 'react';
import type { CommitFn } from '../../store/hooks';
import { DemandField } from '../../ui/DemandField';
import { NumberField } from '../../ui/NumberField';
import { TextField } from '../../ui/TextField';
import { SlotMap } from './SlotMap';

interface DeviceInspectorProps {
  location: DeviceLocation;
  racks: Rack[];
  catalog: Template[];
  commit: CommitFn;
  onSelect: (id: string | null) => void;
}

export function DeviceInspector({ location: { rack, device }, racks, catalog, commit, onSelect }: DeviceInspectorProps) {
  const [confirm, setConfirm] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const key = (k: string): string => `dev:${device.id}:${k}`;
  const update = (patch: DevicePatch, k?: string): string | null => commit({ type: 'device/update', id: device.id, patch }, k === undefined ? undefined : key(k));
  const move = (rackId: string, bottomU: number): string | null => commit({ type: 'device/move', id: device.id, rackId, bottomU }, key('move'));
  const isChassis = device.kind === 'chassis';
  const nodeCount = device.kind === 'chassis' ? device.nodes.length : 0;

  return (
    <div className="inspector__body">
      <header className="inspector__head">
        <h2 className="mono">{device.name}</h2>
        <span className="inspector__hint">
          {device.kind === 'chassis' ? `Chassis · ${device.heightU}U · ${device.slotCount} slots` : `${CATEGORY_LABEL[device.category]} · ${device.heightU}U`}
        </span>
      </header>

      <fieldset className="inspector__group">
        <legend className="visually-hidden">Identity</legend>
        <TextField id={`${device.id}-name`} label="Name" value={device.name} onCommit={(v) => update({ name: v }, 'name')} />
      </fieldset>

      <fieldset className="inspector__group">
        <legend className="lbl">Position</legend>
        <div className="field-pair">
          <div className="field">
            <label htmlFor={`${device.id}-rack`} className="field__label">
              Rack
            </label>
            <div className="field__box">
              <select id={`${device.id}-rack`} className="field__input" value={rack.id} onChange={(e) => setActionError(move(e.target.value, device.bottomU))}>
                {racks.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <NumberField id={`${device.id}-u`} label="Bottom U" decimals={0} value={device.bottomU} onCommit={(v) => (v === null ? null : move(rack.id, v))} />
        </div>
        <p className="inspector__note mono">{`${formatURange(device)} · depth ${device.depthMm} / ${rack.usableDepthMm} mm usable`}</p>
        {actionError ? (
          <p role="alert" className="field__error">
            {actionError}
          </p>
        ) : null}
      </fieldset>

      <fieldset className="inspector__group">
        <legend className="lbl">Power and size</legend>
        <DemandField id={`${device.id}-demand`} label={isChassis ? 'Chassis overhead' : 'Demand'} value={device.demand} onCommit={(d) => update({ demand: d })} />
        <NumberField id={`${device.id}-depth`} label="Depth" unit="mm" decimals={0} value={device.depthMm} onCommit={(v) => (v === null ? null : update({ depthMm: v }, 'depth'))} />
        {device.kind === 'chassis' ? (
          <div className="field-pair">
            <NumberField id={`${device.id}-slots`} label="Slots" decimals={0} value={device.slotCount} onCommit={(v) => (v === null ? null : update({ slotCount: v }, 'slots'))} />
            <NumberField id={`${device.id}-per-row`} label="Slots per row" decimals={0} value={device.slotsPerRow} onCommit={(v) => (v === null ? null : update({ slotsPerRow: v }, 'perRow'))} />
          </div>
        ) : null}
      </fieldset>

      {device.kind === 'chassis' ? <SlotMap chassis={device} catalog={catalog} commit={commit} onSelect={onSelect} /> : null}

      <fieldset className="inspector__group">
        <legend className="visually-hidden">Notes</legend>
        <TextField id={`${device.id}-config`} label="Configuration" multiline value={device.config} onCommit={(v) => update({ config: v }, 'config')} />
        <TextField id={`${device.id}-notes`} label="Notes" multiline value={device.notes} onCommit={(v) => update({ notes: v }, 'notes')} />
      </fieldset>

      <div className="inspector__danger">
        {confirm ? (
          <>
            <span>{`Remove ${device.name}${nodeCount ? ` and its ${nodeCount} ${nodeCount === 1 ? 'Node' : 'Nodes'}` : ''}?`}</span>
            <button
              type="button"
              className="btn btn--sm btn--danger"
              onClick={() => {
                const problem = commit({ type: 'device/remove', id: device.id });
                setActionError(problem);
                if (problem === null) onSelect(null);
              }}
            >
              Remove
            </button>
            <button type="button" className="btn btn--sm btn--quiet" onClick={() => setConfirm(false)}>
              Cancel
            </button>
          </>
        ) : (
          <button type="button" className="btn btn--sm btn--danger" onClick={() => setConfirm(true)}>
            Remove {device.name}
          </button>
        )}
      </div>
    </div>
  );
}
