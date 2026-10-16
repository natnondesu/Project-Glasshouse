import type { Id, PlanContent, PortMedia, PortVlan } from '../model/types';
import { applyPortCommand, portsOf } from '../ports';
import { err, ok, type Result } from '../result';
import { applyVlanCommand } from '../vlans';

/**
 * Only what is given changes; every other field keeps each port's own value. `lag: ''` takes the
 * ports out of their LAG, `vlan: null` clears their VLAN setting.
 */
export interface BulkPortPatch {
  media?: PortMedia;
  speed?: string;
  lag?: string;
  vlan?: PortVlan | null;
}

export interface BulkPortCommand {
  type: 'port/bulk';
  deviceId: Id;
  names: string[];
  patch: BulkPortPatch;
}

/**
 * One change to several ports of a device, all or nothing (and one undo step). It runs the single-port
 * rules in turn, so a LAG still shares one VLAN: setting a VLAN on one member sets it on every member.
 */
export function applyBulkPortCommand(content: PlanContent, cmd: BulkPortCommand): Result<PlanContent> {
  const names = [...new Set(cmd.names)];
  if (names.length === 0) return err('invalid_value', 'Choose at least one port.', [cmd.deviceId]);
  const known = new Set(portsOf(content, cmd.deviceId).map((p) => p.name));
  const missing = names.find((n) => !known.has(n));
  if (missing) return err('not_found', `Port ${missing} no longer exists.`, [cmd.deviceId]);
  const { vlan, ...fields } = cmd.patch;
  const hasFields = Object.values(fields).some((v) => v !== undefined);
  let next = content;
  for (const name of names) {
    if (hasFields) {
      const r = applyPortCommand(next, { type: 'port/update', deviceId: cmd.deviceId, name, patch: fields });
      if (!r.ok) return r;
      next = r.value;
    }
  }
  // VLANs after LAGs: a port that just joined a LAG gets the VLAN asked for, not the LAG's old one.
  if (vlan !== undefined) {
    for (const name of names) {
      const r = applyVlanCommand(next, { type: 'port/vlan', deviceId: cmd.deviceId, name, vlan });
      if (!r.ok) return r;
      next = r.value;
    }
  }
  return ok(next);
}
