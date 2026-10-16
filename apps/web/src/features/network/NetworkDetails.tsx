import { type EquipmentState, describeEnd, effectiveVlan, formatURange, stacksOf, findNode, findRackDevice, linkAt, otherEnd, portsOf, vlanLabel, type Id, type PlanContent } from '@glasshouse/domain';
import { Link } from 'react-router';
import { useT } from '../../i18n';
import { StateIcon } from '../../ui/StateIcon';
import type { TopoSelection } from './TopologyDiagram';
import type { Topology } from './topology';

interface NetworkDetailsProps {
  content: PlanContent;
  stateOf: (id: Id) => EquipmentState;
  roomId: Id;
  topology: Topology;
  selection: TopoSelection;
  onManagePorts: (id: Id) => void;
}

/** What's selected in the diagram: a device's ports and where they go, or the cables on one line. */
export function NetworkDetails({ content, stateOf, roomId, topology, selection, onManagePorts }: NetworkDetailsProps) {
  const m = useT();
  if (!selection) return <p className="net-details__hint">{m.topology.pick}</p>;
  if (selection.kind === 'node') {
    const id = selection.id;
    const stack = stacksOf(content).find((x) => x.id === id);
    if (stack) {
      return (
        <div className="net-details" aria-label={m.inspector.details(stack.name)}>
          <h3 className="mono">{m.stack.box(stack.name)}</h3>
          <p className="net-details__where">{m.stack.option(stack.name, stack.members.length)}</p>
          {stack.members.map((mem) => {
            const found = findRackDevice(content, mem.deviceId);
            if (!found) return null;
            return (
              <section key={mem.deviceId} className="net-details__member" aria-label={m.stack.tag(stack.name, mem.member)}>
                <h4 className="mono">
                  <span className="stack-no">{mem.member}</span>
                  {found.device.name}
                </h4>
                <p className="net-details__where mono">{`${found.rack.name} · ${formatURange(found.device)}`}</p>
                <div className="net-details__actions">
                  <button type="button" className="btn btn--sm" onClick={() => onManagePorts(mem.deviceId)}>
                    {m.topology.managePorts}
                  </button>
                  <Link className="btn btn--sm btn--quiet" to={`/rooms/${roomId}/elevation?sel=${mem.deviceId}`}>
                    {m.topology.openElevation}
                  </Link>
                </div>
                <PortsTable content={content} id={mem.deviceId} stateOf={stateOf} />
              </section>
            );
          })}
        </div>
      );
    }
    const name = findRackDevice(content, id)?.device.name ?? findNode(content, id)?.node.name ?? '';
    const where = topology.nodes.find((n) => n.id === id)?.where ?? '';
    return (
      <div className="net-details" aria-label={m.inspector.details(name)}>
        <h3 className="mono">{name}</h3>
        <p className="net-details__where mono">{where}</p>
        <div className="net-details__actions">
          <button type="button" className="btn btn--sm" onClick={() => onManagePorts(id)}>
            {m.topology.managePorts}
          </button>
          <Link className="btn btn--sm btn--quiet" to={`/rooms/${roomId}/elevation?sel=${id}`}>
            {m.topology.openElevation}
          </Link>
        </div>
        <PortsTable content={content} id={id} stateOf={stateOf} />
      </div>
    );
  }
  const edge = topology.edges.find((e) => e.key === selection.key);
  if (!edge) return null;
  const nameOf = (id: Id): string => topology.nodes.find((n) => n.id === id)?.name ?? '';
  return (
    <div className="net-details">
      <h3 className="mono">{m.topology.between(nameOf(edge.a), nameOf(edge.b))}</h3>
      <p className="net-details__where">{m.topology.cables(edge.links.length)}</p>
      <ul className="net-details__cables">
        {edge.links.map((l) => (
          <li key={l.id}>
            <span className="mono">{`${describeEnd(content, l.a).device} ${l.a.port} ↔ ${describeEnd(content, l.b).device} ${l.b.port}`}</span>
            <span className="net-details__meta">{[l.label, vlanLabel(describeEnd(content, l.a).port?.vlan)].filter(Boolean).join(' · ')}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A device's ports, their VLAN, and where each goes. */
function PortsTable({ content, id, stateOf }: { content: PlanContent; id: Id; stateOf: (id: Id) => EquipmentState }) {
  const m = useT();
  return (
    <table className="net-details__ports" aria-label={m.topology.ports}>
      <tbody>
        {portsOf(content, id).map((p) => {
          const link = linkAt(content, { deviceId: id, port: p.name });
          const far = link ? otherEnd(link, { deviceId: id, port: p.name }) : null;
          const vlan = effectiveVlan(content, { deviceId: id, port: p.name });
          return (
            <tr key={p.name}>
              <th scope="row" className="mono">
                {p.name}
              </th>
              <td className={`mono net-details__vlan${vlan?.from ? ' is-inherited' : ''}`} title={vlan?.from ? m.vlans.fromFar(vlan.from.device, vlan.from.port) : undefined}>
                {vlan ? vlanLabel(vlan.vlan) : ''}
              </td>
              <td>
                {far ? m.topology.to(describeEnd(content, far).device, far.port) : <span className="net-details__none">{m.topology.notCabled}</span>}
                {far && stateOf(far.deviceId) === 'maintenance' ? (
                  <span className="net-details__maint">
                    <StateIcon state="maintenance" />
                    {m.equipment.state.maintenance}
                  </span>
                ) : null}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
