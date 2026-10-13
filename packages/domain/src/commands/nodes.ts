import { validateDemand } from '../demand';
import { findNode, findRackDevice, nextDeviceName, nodeFromTemplate, rememberTemplate, replaceRack } from '../devices';
import { LIMITS } from '../model/defaults';
import type { Chassis, Demand, Id, Node, PlanContent, Rack, Template } from '../model/types';
import { err, ok, withTarget, type Failure, type Result } from '../result';
import { definedOnly, isWholeInRange, validateName } from '../validation';

export interface NodePatch {
  name?: string;
  demand?: Demand;
  config?: string;
  notes?: string;
}

export type NodeCommand =
  | { type: 'node/insert'; id: Id; chassisId: Id; slot: number; template: Template }
  | { type: 'node/update'; id: Id; patch: NodePatch }
  | { type: 'node/remove'; id: Id };

const nodeGone = (id: Id): Failure => err('not_found', 'That Node no longer exists.', [id]);

const replaceChassis = (content: PlanContent, rack: Rack, chassis: Chassis): PlanContent =>
  replaceRack(content, { ...rack, devices: rack.devices.map((d) => (d.id === chassis.id ? chassis : d)) });

function insertNode(content: PlanContent, cmd: Extract<NodeCommand, { type: 'node/insert' }>): Result<PlanContent> {
  const { template, slot } = cmd;
  if (template.mounting !== 'slot') return err('invalid_value', `${template.label} mounts in a rack, not in a Chassis slot.`, [template.id]);
  const loc = findRackDevice(content, cmd.chassisId);
  if (!loc) return err('not_found', 'That Chassis no longer exists.', [cmd.chassisId]);
  if (loc.device.kind !== 'chassis') return err('invalid_value', `${loc.device.name} is not a Chassis.`, [cmd.chassisId]);
  const chassis = loc.device;
  if (!isWholeInRange(slot, 1, chassis.slotCount)) return err('out_of_bounds', `${chassis.name} has slots 1–${chassis.slotCount}.`, [chassis.id]);
  const occupant = chassis.nodes.find((n) => n.slot === slot);
  if (occupant) return err('invalid_value', `Slot ${slot} of ${chassis.name} already holds ${occupant.name}.`, [chassis.id, occupant.id]);
  if (findRackDevice(content, cmd.id) || findNode(content, cmd.id)) return err('invalid_value', 'A Node with this ID already exists.', [cmd.id]);
  const node = nodeFromTemplate(template, cmd.id, nextDeviceName(content, template), slot);
  const nodes = [...chassis.nodes, node].sort((a, b) => a.slot - b.slot);
  return ok(rememberTemplate(replaceChassis(content, loc.rack, { ...chassis, nodes }), template));
}

function updateNode(content: PlanContent, id: Id, patch: NodePatch): Result<PlanContent> {
  const loc = findNode(content, id);
  if (!loc) return nodeGone(id);
  let name = loc.node.name;
  if (patch.name !== undefined) {
    const valid = validateName(patch.name);
    if (!valid.ok) return withTarget(valid, id);
    name = valid.value;
  }
  if (patch.demand) {
    const problem = validateDemand(patch.demand);
    if (problem) return err('invalid_value', problem, [id]);
  }
  for (const [label, value] of [
    ['Configuration', patch.config],
    ['Notes', patch.notes],
  ] as const) {
    if (value !== undefined && value.length > LIMITS.textMaxLength) {
      return err('invalid_value', `${label} must be ${LIMITS.textMaxLength} characters or fewer.`, [id]);
    }
  }
  const next: Node = { ...loc.node, ...definedOnly(patch), name };
  return ok(replaceChassis(content, loc.rack, { ...loc.chassis, nodes: loc.chassis.nodes.map((n) => (n.id === id ? next : n)) }));
}

function removeNode(content: PlanContent, id: Id): Result<PlanContent> {
  const loc = findNode(content, id);
  if (!loc) return nodeGone(id);
  return ok(replaceChassis(content, loc.rack, { ...loc.chassis, nodes: loc.chassis.nodes.filter((n) => n.id !== id) }));
}

export function applyNodeCommand(content: PlanContent, cmd: NodeCommand): Result<PlanContent> {
  switch (cmd.type) {
    case 'node/insert':
      return insertNode(content, cmd);
    case 'node/update':
      return updateNode(content, cmd.id, cmd.patch);
    case 'node/remove':
      return removeNode(content, cmd.id);
  }
}
