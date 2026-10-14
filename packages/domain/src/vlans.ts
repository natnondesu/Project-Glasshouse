import { findNode, findRackDevice, racksOf } from './devices';
import type { Id, PlanContent, Port, PortVlan, Vlan } from './model/types';
import { portsOf, withPorts } from './ports';
import { err, ok, type Result } from './result';

const MAX_VLANS = 256;
const NAME_MAX = 32;

export const isVid = (n: number): boolean => Number.isInteger(n) && n >= 1 && n <= 4094;

/** "10", "Trunk 10,20 · native 99", "Trunk all"; empty when unset. */
export function vlanLabel(v: PortVlan | undefined): string {
  if (!v) return '';
  if (v.mode === 'access') return String(v.vid);
  const allowed = v.allowed === 'all' ? 'all' : v.allowed.join(',');
  return `Trunk ${allowed}${v.native !== null ? ` · native ${v.native}` : ''}`;
}

/** VLAN IDs a port passes, tagged or not; `all` means every VLAN the room has. */
export function carriedVids(content: PlanContent, v: PortVlan | undefined): number[] {
  if (!v) return [];
  if (v.mode === 'access') return [v.vid];
  const tagged = v.allowed === 'all' ? content.vlans.map((x) => x.vid) : v.allowed;
  return [...new Set([...tagged, ...(v.native !== null ? [v.native] : [])])].sort((a, b) => a - b);
}

/** Every port in the room, rewritten by `fn`; untouched devices keep their objects. */
function mapPorts(content: PlanContent, fn: (port: Port) => Port): PlanContent {
  let next = content;
  for (const rack of racksOf(content)) {
    for (const d of rack.devices) {
      const owners = [d, ...(d.kind === 'chassis' ? d.nodes : [])];
      for (const o of owners) {
        if (!o.ports?.length) continue;
        const mapped = o.ports.map(fn);
        if (mapped.some((p, i) => p !== o.ports![i])) next = withPorts(next, o.id, mapped);
      }
    }
  }
  return next;
}

const without = (port: Port): Port => {
  const { vlan: _drop, ...rest } = port;
  return rest;
};

export type VlanCommand =
  | { type: 'vlan/add'; vlan: Vlan }
  | { type: 'vlan/update'; vid: number; patch: Partial<Vlan> }
  | { type: 'vlan/remove'; vid: number }
  | { type: 'port/vlan'; deviceId: Id; name: string; vlan: PortVlan | null };

function checkVlan(content: PlanContent, vlan: Vlan, except: number | null): Result<Vlan> {
  if (!isVid(vlan.vid)) return err('invalid_value', 'VLAN IDs are whole numbers from 1 to 4094.', []);
  if (vlan.vid !== except && content.vlans.some((v) => v.vid === vlan.vid)) return err('invalid_value', `VLAN ${vlan.vid} already exists.`, []);
  const name = vlan.name.trim();
  if (name.length > NAME_MAX) return err('invalid_value', `VLAN names are up to ${NAME_MAX} characters.`, []);
  return ok({ vid: vlan.vid, name });
}

function checkPortVlan(content: PlanContent, v: PortVlan): Result<PortVlan> {
  const known = (vid: number): boolean => content.vlans.some((x) => x.vid === vid);
  const missing = (vid: number) => err('invalid_value', `VLAN ${vid} is not in this room. Add it on the Network tab first.`, []);
  if (v.mode === 'access') return known(v.vid) ? ok({ mode: 'access', vid: v.vid }) : missing(v.vid);
  const allowed = v.allowed === 'all' ? 'all' : [...new Set(v.allowed)].sort((a, b) => a - b);
  if (allowed !== 'all') for (const vid of allowed) if (!known(vid)) return missing(vid);
  if (v.native !== null) {
    if (!known(v.native)) return missing(v.native);
    if (allowed !== 'all' && !allowed.includes(v.native)) return err('invalid_value', 'The native VLAN must be one of the allowed VLANs.', []);
  }
  return ok({ mode: 'trunk', allowed, native: v.native });
}

export function applyVlanCommand(content: PlanContent, cmd: VlanCommand): Result<PlanContent> {
  switch (cmd.type) {
    case 'vlan/add': {
      if (content.vlans.length >= MAX_VLANS) return err('invalid_value', `A room can have up to ${MAX_VLANS} VLANs.`, []);
      const vlan = checkVlan(content, cmd.vlan, null);
      if (!vlan.ok) return vlan;
      return ok({ ...content, vlans: [...content.vlans, vlan.value].sort((a, b) => a.vid - b.vid) });
    }
    case 'vlan/update': {
      const current = content.vlans.find((v) => v.vid === cmd.vid);
      if (!current) return err('not_found', `VLAN ${cmd.vid} no longer exists.`, []);
      const vlan = checkVlan(content, { ...current, ...cmd.patch }, cmd.vid);
      if (!vlan.ok) return vlan;
      const to = vlan.value.vid;
      const re = (vid: number): number => (vid === cmd.vid ? to : vid);
      const vlans = content.vlans.map((v) => (v.vid === cmd.vid ? vlan.value : v)).sort((a, b) => a.vid - b.vid);
      if (to === cmd.vid) return ok({ ...content, vlans });
      // A new VLAN ID follows onto every port that used the old one.
      return ok(
        mapPorts({ ...content, vlans }, (p) => {
          if (!p.vlan) return p;
          if (p.vlan.mode === 'access') return p.vlan.vid === cmd.vid ? { ...p, vlan: { mode: 'access', vid: to } } : p;
          const allowed = p.vlan.allowed === 'all' ? 'all' : p.vlan.allowed.map(re).sort((a, b) => a - b);
          return p.vlan.native === cmd.vid || (p.vlan.allowed !== 'all' && p.vlan.allowed.includes(cmd.vid)) ? { ...p, vlan: { mode: 'trunk', allowed, native: p.vlan.native === null ? null : re(p.vlan.native) } } : p;
        }),
      );
    }
    case 'vlan/remove': {
      if (!content.vlans.some((v) => v.vid === cmd.vid)) return err('not_found', `VLAN ${cmd.vid} no longer exists.`, []);
      const vlans = content.vlans.filter((v) => v.vid !== cmd.vid);
      return ok(
        mapPorts({ ...content, vlans }, (p) => {
          if (!p.vlan) return p;
          if (p.vlan.mode === 'access') return p.vlan.vid === cmd.vid ? without(p) : p;
          const used = p.vlan.native === cmd.vid || (p.vlan.allowed !== 'all' && p.vlan.allowed.includes(cmd.vid));
          if (!used) return p;
          const allowed = p.vlan.allowed === 'all' ? 'all' : p.vlan.allowed.filter((v) => v !== cmd.vid);
          return { ...p, vlan: { mode: 'trunk', allowed, native: p.vlan.native === cmd.vid ? null : p.vlan.native } };
        }),
      );
    }
    case 'port/vlan': {
      const owner = findRackDevice(content, cmd.deviceId)?.device ?? findNode(content, cmd.deviceId)?.node;
      if (!owner) return err('not_found', 'That device no longer exists.', []);
      const ports = portsOf(content, cmd.deviceId);
      const port = ports.find((p) => p.name === cmd.name);
      if (!port) return err('not_found', `${owner.name} has no port ${cmd.name}.`, [owner.id]);
      if (cmd.vlan === null) return ok(withPorts(content, cmd.deviceId, ports.map((p) => (p === port ? without(p) : p))));
      const vlan = checkPortVlan(content, cmd.vlan);
      if (!vlan.ok) return vlan;
      return ok(withPorts(content, cmd.deviceId, ports.map((p) => (p === port ? { ...p, vlan: vlan.value } : p))));
    }
  }
}
