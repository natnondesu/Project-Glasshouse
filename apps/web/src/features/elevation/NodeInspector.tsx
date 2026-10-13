import { formatURange, type NodeLocation, type NodePatch } from '@glasshouse/domain';
import type { CommitFn } from '../../store/hooks';
import { DemandField } from '../../ui/DemandField';
import { TextField } from '../../ui/TextField';

interface NodeInspectorProps {
  location: NodeLocation;
  commit: CommitFn;
  onSelect: (id: string | null) => void;
}

export function NodeInspector({ location: { rack, chassis, node }, commit, onSelect }: NodeInspectorProps) {
  const update = (patch: NodePatch, k?: string): string | null => commit({ type: 'node/update', id: node.id, patch }, k === undefined ? undefined : `node:${node.id}:${k}`);
  return (
    <div className="inspector__body">
      <header className="inspector__head">
        <h2 className="mono">{node.name}</h2>
        <span className="inspector__hint">Node</span>
      </header>
      <p className="inspector__note mono">{`Slot ${node.slot} of ${chassis.name} · ${rack.name} ${formatURange(chassis)}`}</p>
      <button type="button" className="btn btn--sm" onClick={() => onSelect(chassis.id)}>
        Back to {chassis.name}
      </button>
      <fieldset className="inspector__group">
        <legend className="visually-hidden">Node details</legend>
        <TextField id={`${node.id}-name`} label="Name" value={node.name} onCommit={(v) => update({ name: v }, 'name')} />
        <DemandField id={`${node.id}-demand`} label="Demand" value={node.demand} onCommit={(d) => update({ demand: d }, 'demand')} />
        <TextField id={`${node.id}-config`} label="Configuration" multiline value={node.config} onCommit={(v) => update({ config: v }, 'config')} />
        <TextField id={`${node.id}-notes`} label="Notes" multiline value={node.notes} onCommit={(v) => update({ notes: v }, 'notes')} />
      </fieldset>
      <div className="inspector__danger">
        <button
          type="button"
          className="btn btn--sm btn--danger"
          onClick={() => {
            if (commit({ type: 'node/remove', id: node.id }) === null) onSelect(chassis.id);
          }}
        >
          Remove {node.name} from slot {node.slot}
        </button>
      </div>
    </div>
  );
}
