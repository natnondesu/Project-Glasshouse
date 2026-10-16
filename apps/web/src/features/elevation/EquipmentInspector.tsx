import { useT } from "../../i18n";
import { PortsSummary } from "../ports/PortsSummary";
import { EquipmentStateControl } from "./EquipmentStateControl";
import {
  findNode,
  findRackDevice,
  findReserved,
  racksOf,
  type PlanContent,
  type Rack,
  type Template,
  type Plan,
} from "@glasshouse/domain";
import type { CommitFn } from "../../store/hooks";
import { DeviceInspector } from "./DeviceInspector";
import { StackField } from "./StackField";
import { NodeInspector } from "./NodeInspector";
import { RackSummary } from "./RackSummary";
import { ReservedInspector } from "./ReservedInspector";
import "../plan/inspector.css";

interface EquipmentInspectorProps {
  plan?: Plan;
  onManagePorts?: (id: string) => void;
  /** Viewing an older revision: state shows but can't change. */
  stateLocked?: boolean;
  readOnly?: boolean;
  content: PlanContent;
  roomId: string;
  selectedId: string | null;
  activeRack: Rack | null;
  catalog: Template[];
  commit: CommitFn;
  onSelect: (id: string | null) => void;
}

export function EquipmentInspector({
  content,
  roomId,
  selectedId,
  activeRack,
  catalog,
  commit,
  onSelect,
  readOnly = false,
  plan,
  stateLocked = false,
  onManagePorts,
}: EquipmentInspectorProps) {
  const m = useT();
  const device = selectedId ? findRackDevice(content, selectedId) : null;
  const node = !device && selectedId ? findNode(content, selectedId) : null;
  const reserved =
    !device && !node && selectedId ? findReserved(content, selectedId) : null;

  const ownerId = device ? device.device.id : node ? node.node.id : null;
  // Ports sit inside the form but outside its read-only lock: they can be inspected on any revision.
  const ports = ownerId ? (
    <PortsSummary
      content={content}
      deviceId={ownerId}
      ports={(device ? device.device.ports : node!.node.ports) ?? []}
      onManage={onManagePorts}
    />
  ) : null;

  let body;
  if (device)
    body = (
      <DeviceInspector
        key={device.device.id}
        location={device}
        racks={racksOf(content)}
        catalog={catalog}
        commit={commit}
        onSelect={onSelect}
        readOnly={readOnly}
        ports={ports}
        stack={device.device.kind === 'device' && device.device.category === 'network' ? <StackField content={content} deviceId={device.device.id} commit={commit} onSelect={onSelect} readOnly={readOnly} /> : undefined}
      />
    );
  else if (node)
    body = (
      <NodeInspector
        key={node.node.id}
        location={node}
        commit={commit}
        onSelect={onSelect}
        readOnly={readOnly}
        ports={ports}
      />
    );
  else if (reserved)
    body = (
      <ReservedInspector
        key={reserved.range.id}
        rack={reserved.rack}
        range={reserved.range}
        commit={commit}
        onSelect={onSelect}
      />
    );
  else if (activeRack)
    body = (
      <RackSummary
        key={activeRack.id}
        rack={activeRack}
        roomId={roomId}
        commit={commit}
        onSelect={onSelect}
      />
    );
  else body = <p className="inspector__empty">Select a Device to edit it.</p>;

  return (
    <aside className="equip glass" aria-label={m.shell.equipmentDetails}>
      {ownerId && plan ? (
        // Outside the frozen form: state records the site, so it stays editable after approval.
        <div className="equip-live">
          <EquipmentStateControl
            roomId={roomId}
            plan={plan}
            id={ownerId}
            locked={stateLocked}
          />
        </div>
      ) : null}
      {ownerId ? (
        body
      ) : (
        <fieldset className="inspector__lock" disabled={readOnly}>
          {body}
        </fieldset>
      )}
    </aside>
  );
}
