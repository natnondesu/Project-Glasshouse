import { formatURange, type DeviceLocation, type DevicePatch, type Rack, type Template } from '@glasshouse/domain';
import { useState } from 'react';
import type { CommitFn } from '../../store/hooks';
import { DemandField } from '../../ui/DemandField';
import { NumberField } from '../../ui/NumberField';
import { TextField } from '../../ui/TextField';
import { SlotMap } from './SlotMap';
import { useT } from '../../i18n';

interface DeviceInspectorProps {
  location: DeviceLocation;
  racks: Rack[];
  catalog: Template[];
  commit: CommitFn;
  onSelect: (id: string | null) => void;
}

export function DeviceInspector({ location: { rack, device }, racks, catalog, commit, onSelect }: DeviceInspectorProps) {
  const m = useT();
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
          {device.kind === 'chassis' ? m.device.chassisHint(device.heightU, device.slotCount) : m.device.hint(m.categories[device.category], device.heightU)}
        </span>
      </header>

      <fieldset className="inspector__group">
        <legend className="visually-hidden">{m.device.identity}</legend>
        <TextField id={`${device.id}-name`} label={m.device.name} value={device.name} onCommit={(v) => update({ name: v }, 'name')} />
      </fieldset>

      <fieldset className="inspector__group">
        <legend className="lbl">{m.device.position}</legend>
        <div className="field-pair">
          <div className="field">
            <label htmlFor={`${device.id}-rack`} className="field__label">
              {m.device.rack}
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
          <NumberField id={`${device.id}-u`} label={m.device.bottomU} decimals={0} commitOn="blur" value={device.bottomU} onCommit={(v) => (v === null ? null : move(rack.id, v))} />
        </div>
        <p className="inspector__note mono">{m.device.where(formatURange(device), device.depthMm, rack.usableDepthMm)}</p>
        {actionError ? (
          <p role="alert" className="field__error">
            {actionError}
          </p>
        ) : null}
      </fieldset>

      <fieldset className="inspector__group">
        <legend className="lbl">{m.device.powerSize}</legend>
        <DemandField id={`${device.id}-demand`} label={isChassis ? m.device.chassisOverhead : m.device.demand} value={device.demand} onCommit={(d) => update({ demand: d }, 'demand')} />
        <NumberField id={`${device.id}-depth`} label={m.device.depth} unit="mm" decimals={0} value={device.depthMm} onCommit={(v) => (v === null ? null : update({ depthMm: v }, 'depth'))} />
        {device.kind === 'chassis' ? (
          <div className="field-pair">
            <NumberField id={`${device.id}-slots`} label={m.device.slots} decimals={0} commitOn="blur" value={device.slotCount} onCommit={(v) => (v === null ? null : update({ slotCount: v }, 'slots'))} />
            <NumberField id={`${device.id}-per-row`} label={m.device.perRow} decimals={0} commitOn="blur" value={device.slotsPerRow} onCommit={(v) => (v === null ? null : update({ slotsPerRow: v }, 'perRow'))} />
          </div>
        ) : null}
      </fieldset>

      {device.kind === 'chassis' ? <SlotMap chassis={device} catalog={catalog} commit={commit} onSelect={onSelect} /> : null}

      <fieldset className="inspector__group">
        <legend className="visually-hidden">{m.device.notes}</legend>
        <TextField id={`${device.id}-config`} label={m.device.config} multiline value={device.config} onCommit={(v) => update({ config: v }, 'config')} />
        <TextField id={`${device.id}-notes`} label={m.device.notes} multiline value={device.notes} onCommit={(v) => update({ notes: v }, 'notes')} />
      </fieldset>

      <div className="inspector__danger">
        {confirm ? (
          <>
            <span>{m.device.removeQuestion(device.name, nodeCount)}</span>
            <button
              type="button"
              className="btn btn--sm btn--danger"
              onClick={() => {
                const problem = commit({ type: 'device/remove', id: device.id });
                setActionError(problem);
                if (problem === null) onSelect(null);
              }}
            >
              {m.device.remove}
            </button>
            <button type="button" className="btn btn--sm btn--quiet" onClick={() => setConfirm(false)}>
              {m.common.cancel}
            </button>
          </>
        ) : (
          <button type="button" className="btn btn--sm btn--danger" onClick={() => setConfirm(true)}>
            {m.device.removeObject(device.name)}
          </button>
        )}
      </div>
    </div>
  );
}
