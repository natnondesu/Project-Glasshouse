import { findNode, findRackDevice } from './devices';
import type { CableType, Id, NetLink, PlanContent, Port, PortGroup, PortMedia, PortRef, Rack, RoomObject } from './model/types';
import { err, ok, type Result } from './result';

export const PORT_MEDIA: PortMedia[] = ['rj45', 'sfp', 'sfp_plus', 'qsfp'];
export const PORT_MEDIA_LABEL: Record<PortMedia, string> = { rj45: 'RJ45', sfp: 'SFP', sfp_plus: 'SFP+', qsfp: 'QSFP' };
export const PORT_SPEEDS = ['100M', '1G', '2.5G', '10G', '25G', '40G', '100G'];
export const CABLE_TYPES: CableType[] = ['cat6', 'cat6a', 'om3', 'om4', 'os2', 'dac', 'aoc'];
export const CABLE_LABEL: Record<CableType, string> = { cat6: 'Cat 6', cat6a: 'Cat 6A', om3: 'Fibre OM3', om4: 'Fibre OM4', os2: 'Fibre OS2', dac: 'DAC', aoc: 'AOC' };
export const MAX_PORTS = 128;
const PREFIX_MAX = 16;
const PORT_NAME_MAX = 24;
const LINK_LABEL_MAX = 32;

export const expandPorts = (groups: PortGroup[]): Port[] =>
  groups.flatMap((g) => Array.from({ length: g.count }, (_, i) => ({ name: `${g.prefix}${g.start + i}`, media: g.media, speed: g.speed })));

/** An error message, or null when the groups make a valid port list. */
export function validatePortGroups(groups: PortGroup[]): string | null {
  for (const g of groups) {
    if (!Number.isInteger(g.count) || g.count < 1 || g.count > MAX_PORTS) return `Each port group has 1 to ${MAX_PORTS} ports.`;
    if (!Number.isInteger(g.start) || g.start < 0) return 'Port numbers start at 0 or more.';
    if (g.prefix.length > PREFIX_MAX) return `Port name prefixes are up to ${PREFIX_MAX} characters.`;
    if (!PORT_MEDIA.includes(g.media)) return 'Unknown port type.';
  }
  const ports = expandPorts(groups);
  if (ports.length > MAX_PORTS) return `A device has at most ${MAX_PORTS} ports.`;
  const seen = new Set<string>();
  for (const p of ports) {
    if (seen.has(p.name)) return `Port ${p.name} appears twice.`;
    seen.add(p.name);
  }
  return null;
}

interface PortOwner {
  id: Id;
  name: string;
  rack: Rack;
  ports: Port[];
  templateId: Id;
  templateVersion: number;
}

function ownerOf(content: PlanContent, deviceId: Id): PortOwner | null {
  const d = findRackDevice(content, deviceId);
  if (d) return { id: d.device.id, name: d.device.name, rack: d.rack, ports: d.device.ports ?? [], templateId: d.device.templateId, templateVersion: d.device.templateVersion };
  const n = findNode(content, deviceId);
  if (n) return { id: n.node.id, name: n.node.name, rack: n.rack, ports: n.node.ports ?? [], templateId: n.node.templateId, templateVersion: n.node.templateVersion };
  return null;
}

export const portsOf = (content: PlanContent, deviceId: Id): Port[] => ownerOf(content, deviceId)?.ports ?? [];

function withPorts(content: PlanContent, deviceId: Id, ports: Port[]): PlanContent {
  const objects = content.objects.map((o): RoomObject => {
    if (o.type !== 'rack') return o;
    return {
      ...o,
      devices: o.devices.map((d) => {
        if (d.id === deviceId) return { ...d, ports };
        if (d.kind !== 'chassis' || !d.nodes.some((n) => n.id === deviceId)) return d;
        return { ...d, nodes: d.nodes.map((n) => (n.id === deviceId ? { ...n, ports } : n)) };
      }),
    };
  });
  return { ...content, objects };
}

const sameRef = (a: PortRef, b: PortRef): boolean => a.deviceId === b.deviceId && a.port === b.port;
export const linkAt = (content: PlanContent, ref: PortRef): NetLink | undefined => content.links.find((l) => sameRef(l.a, ref) || sameRef(l.b, ref));
/** The far end of `link` seen from `ref`. */
export const otherEnd = (link: NetLink, ref: PortRef): PortRef => (sameRef(link.a, ref) ? link.b : link.a);

/** Links whose ends still exist; commands that remove devices or ports leave the rest to this. */
export function pruneLinks(content: PlanContent): PlanContent {
  const live = (r: PortRef): boolean => ownerOf(content, r.deviceId)?.ports.some((p) => p.name === r.port) ?? false;
  const links = content.links.filter((l) => live(l.a) && live(l.b));
  return links.length === content.links.length ? content : { ...content, links };
}

function checkPortName(owner: PortOwner, name: string, except?: string): Result<string> {
  const n = name.trim();
  if (n.length === 0 || n.length > PORT_NAME_MAX) return err('invalid_value', `Port names are 1 to ${PORT_NAME_MAX} characters.`, [owner.id]);
  if (n !== except && owner.ports.some((p) => p.name === n)) return err('invalid_value', `${owner.name} already has a port ${n}.`, [owner.id]);
  return ok(n);
}

function checkLabel(label: string): Result<string> {
  const l = label.trim();
  return l.length > LINK_LABEL_MAX ? err('invalid_value', `Cable labels are up to ${LINK_LABEL_MAX} characters.`, []) : ok(l);
}

export type PortCommand =
  | { type: 'port/add'; deviceId: Id; port: Port }
  | { type: 'port/update'; deviceId: Id; name: string; patch: Partial<Port> }
  | { type: 'port/remove'; deviceId: Id; name: string }
  | { type: 'port/reset'; deviceId: Id }
  | { type: 'link/add'; link: NetLink }
  | { type: 'link/update'; id: Id; patch: { label?: string; cable?: CableType | null } }
  | { type: 'link/remove'; id: Id };

const gone = (): Result<never> => err('not_found', 'That device no longer exists.', []);

export function applyPortCommand(content: PlanContent, cmd: PortCommand): Result<PlanContent> {
  switch (cmd.type) {
    case 'port/add': {
      const owner = ownerOf(content, cmd.deviceId);
      if (!owner) return gone();
      if (owner.ports.length >= MAX_PORTS) return err('invalid_value', `A device has at most ${MAX_PORTS} ports.`, [owner.id]);
      const name = checkPortName(owner, cmd.port.name);
      if (!name.ok) return name;
      if (!PORT_MEDIA.includes(cmd.port.media)) return err('invalid_value', 'Unknown port type.', [owner.id]);
      return ok(withPorts(content, owner.id, [...owner.ports, { ...cmd.port, name: name.value }]));
    }
    case 'port/update': {
      const owner = ownerOf(content, cmd.deviceId);
      if (!owner) return gone();
      const current = owner.ports.find((p) => p.name === cmd.name);
      if (!current) return err('not_found', `${owner.name} has no port ${cmd.name}.`, [owner.id]);
      const name = checkPortName(owner, cmd.patch.name ?? current.name, current.name);
      if (!name.ok) return name;
      const next: Port = { ...current, ...cmd.patch, name: name.value };
      if (!PORT_MEDIA.includes(next.media)) return err('invalid_value', 'Unknown port type.', [owner.id]);
      const updated = withPorts(content, owner.id, owner.ports.map((p) => (p.name === cmd.name ? next : p)));
      // A rename carries its link with it.
      const from: PortRef = { deviceId: owner.id, port: cmd.name };
      const rename = (r: PortRef): PortRef => (sameRef(r, from) ? { ...r, port: next.name } : r);
      return ok({ ...updated, links: updated.links.map((l) => ({ ...l, a: rename(l.a), b: rename(l.b) })) });
    }
    case 'port/remove': {
      const owner = ownerOf(content, cmd.deviceId);
      if (!owner) return gone();
      if (!owner.ports.some((p) => p.name === cmd.name)) return err('not_found', `${owner.name} has no port ${cmd.name}.`, [owner.id]);
      return ok(withPorts(content, owner.id, owner.ports.filter((p) => p.name !== cmd.name)));
    }
    case 'port/reset': {
      const owner = ownerOf(content, cmd.deviceId);
      if (!owner) return gone();
      const template = content.templatesUsed.find((t) => t.id === owner.templateId && t.version === owner.templateVersion);
      return ok(withPorts(content, owner.id, template?.ports ? expandPorts(template.ports) : []));
    }
    case 'link/add': {
      const { link } = cmd;
      if (content.links.some((l) => l.id === link.id)) return err('invalid_value', 'That ID is already in use.', [link.id]);
      if (sameRef(link.a, link.b)) return err('invalid_value', "A port can't link to itself.", [link.a.deviceId]);
      const label = checkLabel(link.label);
      if (!label.ok) return label;
      for (const end of [link.a, link.b]) {
        const owner = ownerOf(content, end.deviceId);
        if (!owner) return gone();
        if (!owner.ports.some((p) => p.name === end.port)) return err('not_found', `${owner.name} has no port ${end.port}.`, [owner.id]);
        const taken = linkAt(content, end);
        if (taken) {
          const far = otherEnd(taken, end);
          return err('invalid_value', `${owner.name} ${end.port} is already linked to ${ownerOf(content, far.deviceId)?.name ?? 'a removed device'} ${far.port}.`, [owner.id]);
        }
      }
      return ok({ ...content, links: [...content.links, { ...link, label: label.value }] });
    }
    case 'link/update': {
      const current = content.links.find((l) => l.id === cmd.id);
      if (!current) return err('not_found', 'That link no longer exists.', [cmd.id]);
      const label = checkLabel(cmd.patch.label ?? current.label);
      if (!label.ok) return label;
      if (cmd.patch.cable && !CABLE_TYPES.includes(cmd.patch.cable)) return err('invalid_value', 'Unknown cable type.', [cmd.id]);
      const next: NetLink = { ...current, ...cmd.patch, label: label.value };
      return ok({ ...content, links: content.links.map((l) => (l.id === cmd.id ? next : l)) });
    }
    case 'link/remove':
      if (!content.links.some((l) => l.id === cmd.id)) return err('not_found', 'That link no longer exists.', [cmd.id]);
      return ok({ ...content, links: content.links.filter((l) => l.id !== cmd.id) });
  }
}

export interface CableEnd {
  rack: string;
  device: string;
  port: string;
}

export interface CableRow {
  id: Id;
  from: CableEnd;
  to: CableEnd;
  label: string;
  cable: string;
}

/** The cable schedule for the Install sheet: every link, labelled ones first in label order. */
export function cableSchedule(content: PlanContent): CableRow[] {
  const end = (r: PortRef): CableEnd => {
    const owner = ownerOf(content, r.deviceId);
    return { rack: owner?.rack.name ?? '', device: owner?.name ?? '', port: r.port };
  };
  const key = (row: CableRow): string => `${row.label === '' ? '1' : '0'}${row.label}|${row.from.rack}|${row.from.device}|${row.from.port}`;
  return content.links
    .map((l) => ({ id: l.id, from: end(l.a), to: end(l.b), label: l.label, cable: l.cable ? CABLE_LABEL[l.cable] : '' }))
    .sort((x, y) => key(x).localeCompare(key(y), 'en', { numeric: true }));
}

/** Name and media of a port end, for checks and lists. */
export function describeEnd(content: PlanContent, r: PortRef): { device: string; port: Port | null } {
  const owner = ownerOf(content, r.deviceId);
  return { device: owner?.name ?? 'Removed device', port: owner?.ports.find((p) => p.name === r.port) ?? null };
}

/** A name for one more port, following the last one: eth0 → eth1, Gi1/0/48 → Gi1/0/49. */
export function nextPortName(ports: Port[]): string {
  const names = new Set(ports.map((p) => p.name));
  const last = ports[ports.length - 1]?.name ?? 'port0';
  const m = /^(.*?)(\d+)$/.exec(last);
  const prefix = m ? m[1]! : `${last}-`;
  let n = m ? Number(m[2]) + 1 : 1;
  while (names.has(`${prefix}${n}`)) n += 1;
  return `${prefix}${n}`;
}

/** "4× RJ45 1G, 2× SFP+ 10G": ports grouped by kind, for the inspector and the BOM. */
export function portMix(ports: Port[]): string {
  const counts = new Map<string, number>();
  for (const p of ports) {
    const k = `${PORT_MEDIA_LABEL[p.media]} ${p.speed}`;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return [...counts].map(([k, n]) => `${n}× ${k}`).join(', ');
}

/** RFC 4180 CSV of the cable schedule, for printing labels or a cabling contractor. */
export function cableCsv(rows: CableRow[]): string {
  const cell = (v: string): string => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const header = ['Label', 'From rack', 'From device', 'From port', 'To rack', 'To device', 'To port', 'Cable'];
  const lines = rows.map((r) => [r.label, r.from.rack, r.from.device, r.from.port, r.to.rack, r.to.device, r.to.port, r.cable].map(cell).join(','));
  return [header.join(','), ...lines].join('\r\n');
}
