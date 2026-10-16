import { addObject } from './commands/objects';
import { allDeviceNames, rememberTemplate } from './devices';
import { clearanceZones } from './clearance';
import { placementWithin, rotatedBoundsSize, type Poly } from './geometry/polygon';
import type { Id, Metres, Node, PlanContent, Port, RackDevice, RoomObject, Template } from './model/types';
import { idTaken, keepKnownVlan } from './paste';
import { err, ok, type Result } from './result';

export interface PasteObjectCommand {
  type: 'object/paste';
  id: Id;
  /** The copied object as it was; it may come from another room. */
  source: RoomObject;
  at: { x: Metres; y: Metres };
  /** A new ID for every device, node and reserved range inside a copied rack, keyed by the old one. */
  ids: Record<Id, Id>;
  /** Templates the source room knew, so copied devices keep the exact versions they were placed from. */
  templates: Template[];
}

/** "Neopolis-01" → the next free "Neopolis-NN" (same digit width); a name without a number gets "-2", "-3"… */
export function copyName(taken: readonly string[], name: string): string {
  const m = /^(.*?)(\d+)$/.exec(name);
  if (m) {
    const [, prefix, digits] = m as unknown as [string, string, string];
    const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`^${escaped}(\\d+)$`);
    const max = taken.reduce((hi, n) => Math.max(hi, Number(pattern.exec(n)?.[1] ?? 0)), Number(digits));
    return `${prefix}${String(max + 1).padStart(digits.length, '0')}`;
  }
  let n = 2;
  while (taken.includes(`${name}-${n}`)) n += 1;
  return `${name}-${n}`;
}

/** Racks in a row stand shoulder to shoulder; anything else gets a little air. */
const gapFor = (o: RoomObject): Metres => (o.type === 'rack' || o.type === 'existing_rack' ? 0 : 0.1);
const round = (v: number): Metres => Math.round(v * 100) / 100;

type Box = { x: number; y: number; w: number; d: number };
const EPS = 0.005;
const SCAN_STEP_M = 0.1;
const hit = (a: Box, b: Box): boolean => a.x < b.x + b.w - EPS && b.x < a.x + a.w - EPS && a.y < b.y + b.d - EPS && b.y < a.y + a.d - EPS;
const boxOf = (o: RoomObject): Box => ({ x: o.x, y: o.y, ...rotatedBoundsSize(o.w, o.d, o.angle) });
function polyBox(poly: Poly): Box {
  const pts = poly.flat();
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, d: Math.max(...ys) - y };
}
/** A rack's front and rear clearance as boxes: kept clear of copies, as Checks would demand. */
const zonesOf = (o: RoomObject): Box[] => {
  if (o.type !== 'rack') return [];
  const z = clearanceZones(o);
  return [z.front, z.rear].filter((p): p is Poly => p !== null).map(polyBox);
};

/**
 * Where a copy goes: beside `nextTo` on the right, else left, below, above; failing those, the free
 * spot nearest to it. Free means inside the room, clear of other objects and of cut-outs. Null when the
 * room has no free spot for it.
 */
export function pasteSpot(content: PlanContent, source: RoomObject, nextTo: { x: Metres; y: Metres }): { x: Metres; y: Metres } | null {
  const b = rotatedBoundsSize(source.w, source.d, source.angle);
  const gap = gapFor(source);
  const solids = [...content.objects.map(boxOf), ...content.survey.cutOuts];
  const blockers = [...solids, ...content.objects.flatMap(zonesOf)];
  const free = (p: { x: number; y: number }): boolean => {
    if (!placementWithin({ ...p, w: source.w, d: source.d, angle: source.angle }, content.survey.width, content.survey.length)) return false;
    if (blockers.some((o) => hit({ ...p, w: b.w, d: b.d }, o))) return false;
    // The copy's own clearance must not land on anything either.
    return !zonesOf({ ...source, ...p } as RoomObject).some((z) => solids.some((o) => hit(z, o)));
  };
  const sides = [
    { x: nextTo.x + b.w + gap, y: nextTo.y },
    { x: nextTo.x - b.w - gap, y: nextTo.y },
    { x: nextTo.x, y: nextTo.y + b.d + gap },
    { x: nextTo.x, y: nextTo.y - b.d - gap },
  ].map((p) => ({ x: round(p.x), y: round(p.y) }));
  const side = sides.find(free);
  if (side) return side;
  let best: { x: number; y: number; dist: number } | null = null;
  for (let x = 0; x + b.w <= content.survey.width + EPS; x += SCAN_STEP_M) {
    for (let y = 0; y + b.d <= content.survey.length + EPS; y += SCAN_STEP_M) {
      const p = { x: round(x), y: round(y) };
      const dist = Math.hypot(p.x - nextTo.x, p.y - nextTo.y);
      if ((!best || dist < best.dist) && free(p)) best = { ...p, dist };
    }
  }
  return best ? { x: best.x, y: best.y } : null;
}

/**
 * A copy of a plan object at `at`: new ID and next free name. A rack brings its devices, nodes and
 * reserved ranges with new IDs and names; cables and power feeds stay with the original, and on-site
 * state starts at Planned.
 */
export function pasteObject(content: PlanContent, cmd: PasteObjectCommand): Result<PlanContent> {
  const { source } = cmd;
  const base = { ...source, id: cmd.id, name: copyName(content.objects.map((o) => o.name), source.name), x: cmd.at.x, y: cmd.at.y };
  if (source.type !== 'rack') return addObject(content, base as RoomObject);

  const vids = new Set(content.vlans.map((v) => v.vid));
  const ports = (p?: Port[]): { ports?: Port[] } => (p ? { ports: p.map((x) => keepKnownVlan(x, vids)) } : {});
  const taken = allDeviceNames(content);
  const rename = (name: string): string => {
    const next = copyName(taken, name);
    taken.push(next);
    return next;
  };
  const idOf = (old: Id): Id | null => cmd.ids[old] ?? null;
  const needed: { templateId: Id; templateVersion: number; name: string }[] = [];
  let missing = false;
  const devices: RackDevice[] = source.devices.map((d) => {
    needed.push(d);
    const id = idOf(d.id);
    if (!id) missing = true;
    const { ports: _p, ...rest } = d;
    if (d.kind !== 'chassis') return { ...rest, id: id ?? d.id, name: rename(d.name), ...ports(d.ports) } as RackDevice;
    const nodes: Node[] = d.nodes.map((n) => {
      needed.push(n);
      const nid = idOf(n.id);
      if (!nid) missing = true;
      const { ports: _np, ...nrest } = n;
      return { ...nrest, id: nid ?? n.id, name: rename(n.name), ...ports(n.ports) };
    });
    return { ...rest, id: id ?? d.id, name: rename(d.name), ...ports(d.ports), nodes } as RackDevice;
  });
  const reserved = source.reserved.map((r) => {
    const id = idOf(r.id);
    if (!id) missing = true;
    return { ...r, id: id ?? r.id };
  });
  if (missing) return err('invalid_value', 'Each copied device needs a new ID.', [cmd.id]);
  const fresh = Object.values(cmd.ids);
  if (new Set(fresh).size !== fresh.length || fresh.some((id) => idTaken(content, id))) return err('invalid_value', 'A device with this ID already exists.', [cmd.id]);
  const templates = needed.map((d) => cmd.templates.find((t) => t.id === d.templateId && t.version === d.templateVersion));
  const lost = needed.find((_, i) => !templates[i]);
  if (lost) return err('invalid_value', `The template ${lost.name} was placed from is missing.`, [cmd.id]);
  const added = addObject(content, { ...base, type: 'rack', devices, reserved } as RoomObject);
  if (!added.ok) return added;
  return ok(templates.reduce((c, t) => rememberTemplate(c, t!), added.value));
}

/** Every device, node and reserved range ID inside an object, for minting new ones before a paste. */
export function innerIds(o: RoomObject): Id[] {
  if (o.type !== 'rack') return [];
  return [...o.devices.flatMap((d) => [d.id, ...(d.kind === 'chassis' ? d.nodes.map((n) => n.id) : [])]), ...o.reserved.map((r) => r.id)];
}
