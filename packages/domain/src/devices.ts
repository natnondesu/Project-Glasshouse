import { expandPorts } from './ports';
import { isRack } from './model/types';
import type { Category, Chassis, Id, Node, PlanContent, Rack, RackDevice, ReservedRange, Template, Units, Port } from './model/types';

export const PREFIX: Record<Category, string> = { server: 'SRV', network: 'SW', power: 'PWR', chassis: 'CH', misc: 'MISC' };

export const racksOf = (content: PlanContent): Rack[] => content.objects.filter(isRack);

export const getRack = (content: PlanContent, id: Id): Rack | null => racksOf(content).find((r) => r.id === id) ?? null;

export interface DeviceLocation {
  rack: Rack;
  device: RackDevice;
}

export function findRackDevice(content: PlanContent, id: Id): DeviceLocation | null {
  for (const rack of racksOf(content)) {
    const device = rack.devices.find((d) => d.id === id);
    if (device) return { rack, device };
  }
  return null;
}

export interface NodeLocation {
  rack: Rack;
  chassis: Chassis;
  node: Node;
}

export function findNode(content: PlanContent, id: Id): NodeLocation | null {
  for (const rack of racksOf(content)) {
    for (const d of rack.devices) {
      if (d.kind !== 'chassis') continue;
      const node = d.nodes.find((n) => n.id === id);
      if (node) return { rack, chassis: d, node };
    }
  }
  return null;
}

export function findReserved(content: PlanContent, id: Id): { rack: Rack; range: ReservedRange } | null {
  for (const rack of racksOf(content)) {
    const range = rack.reserved.find((r) => r.id === id);
    if (range) return { rack, range };
  }
  return null;
}

export const allDeviceNames = (content: PlanContent): string[] =>
  racksOf(content).flatMap((r) => r.devices.flatMap((d) => (d.kind === 'chassis' ? [d.name, ...d.nodes.map((n) => n.name)] : [d.name])));

export function nextDeviceName(content: PlanContent, template: Template): string {
  return nextNameWithPrefix(content, template.mounting === 'slot' ? 'NODE' : PREFIX[template.category], []);
}

/** The next PREFIX-NN after every name in the room and in `alsoTaken` (names about to be used). */
export function nextNameWithPrefix(content: PlanContent, prefix: string, alsoTaken: string[]): string {
  const pattern = new RegExp(`^${prefix}-(\\d+)$`);
  const max = [...allDeviceNames(content), ...alsoTaken].reduce((m, n) => {
    const match = pattern.exec(n);
    return match?.[1] ? Math.max(m, Number(match[1])) : m;
  }, 0);
  return `${prefix}-${String(max + 1).padStart(2, '0')}`;
}

/** Absent rather than empty when the template has none, so older devices and templates look the same. */
const portsFromTemplate = (template: Template): { ports?: Port[] } => (template.ports?.length ? { ports: expandPorts(template.ports) } : {});

export function deviceFromTemplate(template: Template, id: Id, name: string, bottomU: Units): RackDevice {
  const base = {
    id,
    templateId: template.id,
    templateVersion: template.version,
    name,
    demand: { ...template.demand },
    config: template.defaultConfig,
    notes: '',
    ...portsFromTemplate(template),
    bottomU,
    heightU: template.heightU,
    depthMm: template.depthMm,
  };
  if (template.category === 'chassis') {
    const slotCount = template.slotCount ?? 1;
    return { ...base, kind: 'chassis', slotCount, slotsPerRow: template.slotsPerRow ?? slotCount, nodes: [] };
  }
  return { ...base, kind: 'device', category: template.category };
}

export const nodeFromTemplate = (template: Template, id: Id, name: string, slot: number): Node => ({
  id,
  templateId: template.id,
  templateVersion: template.version,
  name,
  demand: { ...template.demand },
  config: template.defaultConfig,
  notes: '',
  ...portsFromTemplate(template),
  slot,
});

export const replaceRack = (content: PlanContent, rack: Rack): PlanContent => ({
  ...content,
  objects: content.objects.map((o) => (o.id === rack.id ? rack : o)),
});

export function rememberTemplate(content: PlanContent, template: Template): PlanContent {
  if (content.templatesUsed.some((t) => t.id === template.id && t.version === template.version)) return content;
  return { ...content, templatesUsed: [...content.templatesUsed, { ...template, demand: { ...template.demand }, ...(template.ports ? { ports: template.ports.map((g) => ({ ...g })) } : {}) }] };
}
