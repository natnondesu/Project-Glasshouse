import type { ReactNode } from "react";
import {
  formatURange,
  type NodeLocation,
  type NodePatch,
} from "@glasshouse/domain";
import type { CommitFn } from "../../store/hooks";
import { DemandField } from "../../ui/DemandField";
import { TextField } from "../../ui/TextField";
import { useT } from "../../i18n";

interface NodeInspectorProps {
  location: NodeLocation;
  commit: CommitFn;
  onSelect: (id: string | null) => void;
  readOnly?: boolean;
  ports?: ReactNode;
}

export function NodeInspector({
  location: { rack, chassis, node },
  commit,
  onSelect,
  readOnly = false,
  ports = null,
}: NodeInspectorProps) {
  const m = useT();
  const update = (patch: NodePatch, k?: string): string | null =>
    commit(
      { type: "node/update", id: node.id, patch },
      k === undefined ? undefined : `node:${node.id}:${k}`,
    );
  return (
    <div className="inspector__body">
      <header className="inspector__head">
        <h2 className="mono">{node.name}</h2>
        <span className="inspector__hint">{m.device.node}</span>
      </header>
      <p className="inspector__note mono">
        {m.device.nodeWhere(
          node.slot,
          chassis.name,
          rack.name,
          formatURange(chassis),
        )}
      </p>
      <fieldset
        className="inspector__lock inspector__lock--flow"
        disabled={readOnly}
      >
        <button
          type="button"
          className="btn btn--sm"
          onClick={() => onSelect(chassis.id)}
        >
          {m.device.backTo(chassis.name)}
        </button>
        <fieldset className="inspector__group">
          <legend className="visually-hidden">{m.device.nodeDetails}</legend>
          <TextField
            id={`${node.id}-name`}
            label={m.device.name}
            value={node.name}
            onCommit={(v) => update({ name: v }, "name")}
          />
          <DemandField
            id={`${node.id}-demand`}
            label={m.device.demand}
            value={node.demand}
            onCommit={(d) => update({ demand: d }, "demand")}
          />
        </fieldset>
      </fieldset>

      {ports}

      <fieldset
        className="inspector__lock inspector__lock--flow"
        disabled={readOnly}
      >
        <fieldset className="inspector__group">
          <legend className="visually-hidden">{m.device.notes}</legend>
          <TextField
            id={`${node.id}-config`}
            label={m.device.config}
            multiline
            value={node.config}
            onCommit={(v) => update({ config: v }, "config")}
          />
          <TextField
            id={`${node.id}-notes`}
            label={m.device.notes}
            multiline
            value={node.notes}
            onCommit={(v) => update({ notes: v }, "notes")}
          />
        </fieldset>
        <div className="inspector__danger">
          <button
            type="button"
            className="btn btn--sm btn--danger"
            onClick={() => {
              if (commit({ type: "node/remove", id: node.id }) === null)
                onSelect(chassis.id);
            }}
          >
            {m.device.removeNode(node.name, node.slot)}
          </button>
        </div>
      </fieldset>
    </div>
  );
}
