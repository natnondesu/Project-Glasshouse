import { validateDemand } from '../demand';
import { deviceFromTemplate, findNode, findRackDevice, findReserved, getRack, nextDeviceName, rememberTemplate, replaceRack } from '../devices';
import { LIMITS } from '../model/defaults';
import type { Demand, Id, Millimetres, PlanContent, RackDevice, ReservedRange, Template, Units } from '../model/types';
import { checkSpan } from '../occupancy';
import { err, ok, withTarget, type Failure, type Result } from '../result';
import { definedOnly, isWholeInRange, validateName } from '../validation';

export interface DevicePatch {
  name?: string;
  demand?: Demand;
  config?: string;
  notes?: string;
  depthMm?: Millimetres;
  slotCount?: number;
  slotsPerRow?: number;
}

export type EquipmentCommand =
  | { type: 'device/place'; id: Id; rackId: Id; bottomU: Units; template: Template }
  | { type: 'device/move'; id: Id; rackId: Id; bottomU: Units }
  | { type: 'device/update'; id: Id; patch: DevicePatch }
  | { type: 'device/remove'; id: Id }
  | { type: 'reserved/add'; rackId: Id; range: ReservedRange }
  | { type: 'reserved/update'; id: Id; patch: Partial<Omit<ReservedRange, 'id'>> }
  | { type: 'reserved/remove'; id: Id };

const rackGone = (id: Id): Failure => err('not_found', 'That rack no longer exists.', [id]);
const deviceGone = (id: Id): Failure => err('not_found', 'That device no longer exists.', [id]);
const rangeGone = (id: Id): Failure => err('not_found', 'That reserved range no longer exists.', [id]);

const idTaken = (content: PlanContent, id: Id): boolean =>
  findRackDevice(content, id) !== null || findNode(content, id) !== null || findReserved(content, id) !== null;

function textError(value: string | undefined, label: string, id: Id): Failure | null {
  if (value !== undefined && value.length > LIMITS.textMaxLength) {
    return err('invalid_value', `${label} must be ${LIMITS.textMaxLength} characters or fewer.`, [id]);
  }
  return null;
}

function placeDevice(content: PlanContent, cmd: Extract<EquipmentCommand, { type: 'device/place' }>): Result<PlanContent> {
  const { template } = cmd;
  if (template.mounting !== 'rack') return err('invalid_value', `${template.label} goes in a Chassis slot, not directly in a rack.`, [template.id]);
  const rack = getRack(content, cmd.rackId);
  if (!rack) return rackGone(cmd.rackId);
  if (idTaken(content, cmd.id)) return err('invalid_value', 'A device with this ID already exists.', [cmd.id]);
  const device = deviceFromTemplate(template, cmd.id, nextDeviceName(content, template), cmd.bottomU);
  const clash = checkSpan(rack, { id: device.id, label: device.name, bottomU: device.bottomU, heightU: device.heightU });
  if (clash) return clash;
  return ok(rememberTemplate(replaceRack(content, { ...rack, devices: [...rack.devices, device] }), template));
}

function moveDevice(content: PlanContent, id: Id, rackId: Id, bottomU: Units): Result<PlanContent> {
  const loc = findRackDevice(content, id);
  if (!loc) return deviceGone(id);
  const dest = getRack(content, rackId);
  if (!dest) return rackGone(rackId);
  const moved: RackDevice = { ...loc.device, bottomU };
  const clash = checkSpan(dest, { id, label: moved.name, bottomU, heightU: moved.heightU });
  if (clash) return clash;
  const without = replaceRack(content, { ...loc.rack, devices: loc.rack.devices.filter((d) => d.id !== id) });
  const target = getRack(without, rackId);
  if (!target) return rackGone(rackId);
  return ok(replaceRack(without, { ...target, devices: [...target.devices, moved] }));
}

function updateDevice(content: PlanContent, id: Id, patch: DevicePatch): Result<PlanContent> {
  const loc = findRackDevice(content, id);
  if (!loc) return deviceGone(id);
  const { device, rack } = loc;
  if (device.kind !== 'chassis' && (patch.slotCount !== undefined || patch.slotsPerRow !== undefined)) {
    return err('invalid_value', `${device.name} is not a Chassis.`, [id]);
  }
  let name = device.name;
  if (patch.name !== undefined) {
    const valid = validateName(patch.name);
    if (!valid.ok) return withTarget(valid, id);
    name = valid.value;
  }
  if (patch.demand) {
    const problem = validateDemand(patch.demand);
    if (problem) return err('invalid_value', problem, [id]);
  }
  if (patch.depthMm !== undefined && !isWholeInRange(patch.depthMm, LIMITS.deviceDepthMinMm, LIMITS.deviceDepthMaxMm)) {
    return err('invalid_value', 'Depth must be a whole number from 100 to 1500 mm.', [id]);
  }
  const text = textError(patch.config, 'Configuration', id) ?? textError(patch.notes, 'Notes', id);
  if (text) return text;

  const { slotCount, slotsPerRow, ...common } = patch;
  let next: RackDevice = { ...device, ...definedOnly(common), name };
  if (next.kind === 'chassis') {
    const slots = slotCount ?? next.slotCount;
    if (!isWholeInRange(slots, 1, LIMITS.chassisMaxSlots)) return err('invalid_value', 'A Chassis needs between 1 and 64 slots.', [id]);
    const blocking = next.nodes.find((n) => n.slot > slots);
    if (blocking) {
      return err('invalid_value', `Slot ${blocking.slot} holds ${blocking.name}. Move or remove it before reducing ${next.name} to ${slots} slots.`, [id, blocking.id]);
    }
    const perRow = slotsPerRow ?? Math.min(next.slotsPerRow, slots);
    if (!isWholeInRange(perRow, 1, slots)) return err('invalid_value', `Slots per row must be between 1 and ${slots}.`, [id]);
    next = { ...next, slotCount: slots, slotsPerRow: perRow };
  }
  const updated = next;
  return ok(replaceRack(content, { ...rack, devices: rack.devices.map((d) => (d.id === id ? updated : d)) }));
}

function removeDevice(content: PlanContent, id: Id): Result<PlanContent> {
  const loc = findRackDevice(content, id);
  if (!loc) return deviceGone(id);
  return ok(replaceRack(content, { ...loc.rack, devices: loc.rack.devices.filter((d) => d.id !== id) }));
}

function validateRange(range: ReservedRange): Result<ReservedRange> {
  const label = validateName(range.label, 'Label');
  if (!label.ok) return withTarget(label, range.id);
  const problem = validateDemand(range.demand);
  if (problem) return err('invalid_value', problem, [range.id]);
  const text = textError(range.notes, 'Notes', range.id);
  if (text) return text;
  return ok({ ...range, label: label.value });
}

function addReserved(content: PlanContent, rackId: Id, range: ReservedRange): Result<PlanContent> {
  const rack = getRack(content, rackId);
  if (!rack) return rackGone(rackId);
  if (idTaken(content, range.id)) return err('invalid_value', 'A reserved range with this ID already exists.', [range.id]);
  const valid = validateRange(range);
  if (!valid.ok) return valid;
  const clash = checkSpan(rack, { id: range.id, label: valid.value.label, bottomU: range.bottomU, heightU: range.heightU });
  if (clash) return clash;
  return ok(replaceRack(content, { ...rack, reserved: [...rack.reserved, valid.value] }));
}

function updateReserved(content: PlanContent, id: Id, patch: Partial<Omit<ReservedRange, 'id'>>): Result<PlanContent> {
  const found = findReserved(content, id);
  if (!found) return rangeGone(id);
  const valid = validateRange({ ...found.range, ...definedOnly(patch), id });
  if (!valid.ok) return valid;
  const clash = checkSpan(found.rack, { id, label: valid.value.label, bottomU: valid.value.bottomU, heightU: valid.value.heightU });
  if (clash) return clash;
  return ok(replaceRack(content, { ...found.rack, reserved: found.rack.reserved.map((r) => (r.id === id ? valid.value : r)) }));
}

function removeReserved(content: PlanContent, id: Id): Result<PlanContent> {
  const found = findReserved(content, id);
  if (!found) return rangeGone(id);
  return ok(replaceRack(content, { ...found.rack, reserved: found.rack.reserved.filter((r) => r.id !== id) }));
}

export function applyEquipmentCommand(content: PlanContent, cmd: EquipmentCommand): Result<PlanContent> {
  switch (cmd.type) {
    case 'device/place':
      return placeDevice(content, cmd);
    case 'device/move':
      return moveDevice(content, cmd.id, cmd.rackId, cmd.bottomU);
    case 'device/update':
      return updateDevice(content, cmd.id, cmd.patch);
    case 'device/remove':
      return removeDevice(content, cmd.id);
    case 'reserved/add':
      return addReserved(content, cmd.rackId, cmd.range);
    case 'reserved/update':
      return updateReserved(content, cmd.id, cmd.patch);
    case 'reserved/remove':
      return removeReserved(content, cmd.id);
  }
}
