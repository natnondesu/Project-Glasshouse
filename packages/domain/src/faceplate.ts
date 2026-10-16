import type { PlanContent, Port, PortGroup, Template } from './model/types';
import { expandPorts } from './ports';

/** One block of jacks on a front panel: a port group, drawn in one or two rows. */
export interface FaceBlock {
  /** "Gi1/0/" over the block, as printed on real gear; empty when the names have no shared prefix. */
  label: string;
  /** Rows of jacks, top first; jack i of the bottom row sits under jack i of the top one. A port the device no longer has leaves its place empty (null), as the panel would. */
  rows: (Port | null)[][];
}

/** Lays a group's ports out as its front panel shows them. */
function layout<T>(ports: T[], g: Pick<PortGroup, 'rows' | 'order'>): T[][] {
  if ((g.rows ?? 1) === 1 || ports.length < 2) return [ports];
  if ((g.order ?? 'odd_top') === 'odd_top') {
    return [ports.filter((_, i) => i % 2 === 0), ports.filter((_, i) => i % 2 === 1)];
  }
  const top = Math.ceil(ports.length / 2);
  return [ports.slice(0, top), ports.slice(top)];
}

/** Ports with a shared name prefix ("eth0", "eth1") as one block, for ports no group explains. */
function looseBlocks(ports: Port[]): FaceBlock[] {
  const blocks: { label: string; ports: Port[] }[] = [];
  for (const port of ports) {
    const prefix = /^(.*?)\d+$/.exec(port.name)?.[1] ?? '';
    const last = blocks[blocks.length - 1];
    if (last && last.label === prefix && prefix) last.ports.push(port);
    else blocks.push({ label: prefix, ports: [port] });
  }
  return blocks.map((b) => ({ label: b.label, rows: [b.ports] }));
}

/**
 * The front panel of a device: one block per port group of its template, laid out in its rows, using
 * the device's own ports (matched by name, so per-device changes show). Ports the template doesn't
 * name, added on this device, follow in blocks of their own.
 */
export function faceplateBlocks(groups: PortGroup[] | undefined, ports: Port[]): FaceBlock[] {
  const byName = new Map(ports.map((p) => [p.name, p]));
  const used = new Set<string>();
  const blocks: FaceBlock[] = [];
  for (const g of groups ?? []) {
    // Positions come from the template, so a port removed on this device leaves a gap rather than shifting the rest.
    const slots = expandPorts([g]).map((tp) => {
      const own = byName.get(tp.name);
      if (!own || used.has(own.name)) return null;
      used.add(own.name);
      return own;
    });
    if (slots.some(Boolean)) blocks.push({ label: g.prefix, rows: layout(slots, g) });
  }
  return [...blocks, ...looseBlocks(ports.filter((p) => !used.has(p.name)))];
}

/** The template a placed device or node came from, as the room recorded it. */
export const templateOf = (content: PlanContent, owner: { templateId: string; templateVersion: number }): Template | undefined =>
  content.templatesUsed.find((t) => t.id === owner.templateId && t.version === owner.templateVersion);
