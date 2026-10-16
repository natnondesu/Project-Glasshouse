import { findNode, findRackDevice, findReserved, getRack, nextNameWithPrefix, PREFIX, rememberTemplate, replaceRack } from './devices';
import type { Id, Node, PlanContent, Port, PortVlan, RackDevice, Template, Units } from './model/types';
import { checkSpan } from './occupancy';
import { err, ok, type Result } from './result';

export interface PasteDeviceCommand {
  type: 'device/paste';
  id: Id;
  rackId: Id;
  bottomU: Units;
  /** The copied device as it was; it may come from another room. */
  source: RackDevice;
  /** New IDs for the copied Chassis's Nodes, in the same order. */
  nodeIds: Id[];
  /** Templates the source room knew, so the copy keeps the exact versions it was placed from. */
  templates: Template[];
}

/**
 * A copied port: VLAN settings only survive where every VLAN they name exists in this room, and an
 * uplink to another room stays with the original (two ports can't be that one cable's end).
 */
export function keepKnownVlan(original: Port, vids: ReadonlySet<number>): Port {
  const { remote: _uplink, ...port } = original;
  const v: PortVlan | undefined = port.vlan;
  if (!v) return port;
  const named = v.mode === 'access' ? [v.vid] : [...(v.allowed === 'all' ? [] : v.allowed), ...(v.native === null ? [] : [v.native])];
  if (named.every((vid) => vids.has(vid))) return port;
  const { vlan: _dropped, ...rest } = port;
  return rest;
}

export const idTaken = (content: PlanContent, id: Id): boolean => findRackDevice(content, id) !== null || findNode(content, id) !== null || findReserved(content, id) !== null;

/**
 * A copy of a device: new ID and next free name, same template, demand, configuration, notes and
 * ports. Cables and feeds belong to the original, and equipment state starts at Planned (it is kept
 * per ID outside the content).
 */
export function pasteDevice(content: PlanContent, cmd: PasteDeviceCommand): Result<PlanContent> {
  const rack = getRack(content, cmd.rackId);
  if (!rack) return err('not_found', 'That rack no longer exists.', [cmd.rackId]);
  const { source } = cmd;
  const nodes = source.kind === 'chassis' ? source.nodes : [];
  if (cmd.nodeIds.length !== nodes.length) return err('invalid_value', 'Each pasted Node needs an ID.');
  const ids = [cmd.id, ...cmd.nodeIds];
  if (new Set(ids).size !== ids.length || ids.some((id) => idTaken(content, id))) return err('invalid_value', 'A device with this ID already exists.', [cmd.id]);

  const needed = [source, ...nodes].map((d) => cmd.templates.find((t) => t.id === d.templateId && t.version === d.templateVersion));
  if (needed.some((t) => !t)) return err('invalid_value', `The template ${source.name} was placed from is missing.`, [cmd.id]);

  const vids = new Set(content.vlans.map((v) => v.vid));
  const ports = (p?: Port[]): { ports?: Port[] } => (p ? { ports: p.map((x) => keepKnownVlan(x, vids)) } : {});
  const prefix = source.kind === 'chassis' ? PREFIX.chassis : PREFIX[source.category];
  const name = nextNameWithPrefix(content, prefix, []);
  const taken = [name];
  const copiedNodes: Node[] = nodes.map((n, i) => {
    const nodeName = nextNameWithPrefix(content, 'NODE', taken);
    taken.push(nodeName);
    return { ...n, id: cmd.nodeIds[i]!, name: nodeName, ...ports(n.ports) };
  });
  const { ports: _p, ...base } = source;
  const copy: RackDevice =
    source.kind === 'chassis'
      ? { ...(base as typeof source), id: cmd.id, name, bottomU: cmd.bottomU, ...ports(source.ports), nodes: copiedNodes }
      : { ...(base as typeof source), id: cmd.id, name, bottomU: cmd.bottomU, ...ports(source.ports) };
  const clash = checkSpan(rack, { id: copy.id, label: copy.name, bottomU: copy.bottomU, heightU: copy.heightU });
  if (clash) return clash;
  const placed = replaceRack(content, { ...rack, devices: [...rack.devices, copy] });
  return ok(needed.reduce((c, t) => rememberTemplate(c, t!), placed));
}
