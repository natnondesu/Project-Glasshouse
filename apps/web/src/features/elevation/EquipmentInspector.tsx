import { useT } from '../../i18n';
import { PortsSummary } from '../ports/PortsSummary';
import { EquipmentStateControl } from './EquipmentStateControl';
import { findNode, findRackDevice, findReserved, racksOf, type PlanContent, type Rack, type Template, type Plan } from '@glasshouse/domain';
import type { CommitFn } from '../../store/hooks';
import { DeviceInspector } from './DeviceInspector';
import { NodeInspector } from './NodeInspector';
import { RackSummary } from './RackSummary';
import { ReservedInspector } from './ReservedInspector';
import '../plan/inspector.css';

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

export function EquipmentInspector({ content, roomId, selectedId, activeRack, catalog, commit, onSelect, readOnly = false, plan, stateLocked = false, onManagePorts }: EquipmentInspectorProps) {
  const m = useT();
  const device = selectedId ? findRackDevice(content, selectedId) : null;
  const node = !device && selectedId ? findNode(content, selectedId) : null;
  const reserved = !device && !node && selectedId ? findReserved(content, selectedId) : null;

  let body;
  if (device) body = <DeviceInspector key={device.device.id} location={device} racks={racksOf(content)} catalog={catalog} commit={commit} onSelect={onSelect} />;
  else if (node) body = <NodeInspector key={node.node.id} location={node} commit={commit} onSelect={onSelect} />;
  else if (reserved) body = <ReservedInspector key={reserved.range.id} rack={reserved.rack} range={reserved.range} commit={commit} onSelect={onSelect} />;
  else if (activeRack) body = <RackSummary key={activeRack.id} rack={activeRack} roomId={roomId} commit={commit} onSelect={onSelect} />;
  else body = <p className="inspector__empty">Select a Device to edit it.</p>;

  return (
    <aside className="equip glass" aria-label={m.shell.equipmentDetails}>
      {device || node ? (
        // Outside the frozen fieldset: state records the site and ports can be inspected on any revision.
        <div className="equip-live">
          {plan ? <EquipmentStateControl roomId={roomId} plan={plan} id={device ? device.device.id : node!.node.id} locked={stateLocked} /> : null}
          <PortsSummary content={content} deviceId={device ? device.device.id : node!.node.id} ports={(device ? device.device.ports : node!.node.ports) ?? []} onManage={onManagePorts} />
        </div>
      ) : null}
      <fieldset className="inspector__lock" disabled={readOnly}>
        {body}
      </fieldset>
    </aside>
  );
}
