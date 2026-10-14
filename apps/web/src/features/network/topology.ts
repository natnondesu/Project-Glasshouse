import { carriedVids, describeEnd, findNode, findRackDevice, racksOf, type Category, type Id, type NetLink, type PlanContent } from '@glasshouse/domain';

export const NODE_W = 152;
export const NODE_H = 50;
const H_GAP = 22;
const ROW_H = 120;
const MARGIN = 24;
const SWITCH_MIN_PORTS = 4;

export interface TopoNode {
  id: Id;
  name: string;
  /** "RK-01 · U42" or "CH-01 slot 3". */
  where: string;
  category: Category | 'node';
  x: number;
  y: number;
  /** Leaves hang off one other device (a server on its switch); the rest is network gear. */
  leaf: boolean;
}

export interface TopoEdge {
  key: string;
  a: Id;
  b: Id;
  links: NetLink[];
  fibre: boolean;
  /** Drawn as an elbow from parent down to child; other edges (peer uplinks, redundant paths) go straight. */
  tree: boolean;
  /** VLANs both ends of at least one of its cables carry. */
  vids: number[];
}

export interface Topology {
  nodes: TopoNode[];
  edges: TopoEdge[];
  width: number;
  height: number;
  /** Devices with ports but no cables, listed beside the diagram. */
  unlinked: { id: Id; name: string; where: string }[];
}

const FIBRE_CABLES = new Set(['om3', 'om4', 'os2', 'aoc']);

interface Owner {
  id: Id;
  name: string;
  where: string;
  category: Category | 'node';
  rack: string;
  ports: number;
}

function owners(content: PlanContent): Map<Id, Owner> {
  const out = new Map<Id, Owner>();
  for (const rack of racksOf(content)) {
    for (const d of rack.devices) {
      const u = d.heightU === 1 ? `U${d.bottomU}` : `U${d.bottomU}–U${d.bottomU + d.heightU - 1}`;
      out.set(d.id, { id: d.id, name: d.name, where: `${rack.name} · ${u}`, category: d.kind === 'chassis' ? 'chassis' : d.category, rack: rack.name, ports: d.ports?.length ?? 0 });
      if (d.kind === 'chassis') for (const n of d.nodes) out.set(n.id, { id: n.id, name: n.name, where: `${d.name} slot ${n.slot}`, category: 'node', rack: rack.name, ports: n.ports?.length ?? 0 });
    }
  }
  return out;
}

const byPlace = (o: Map<Id, Owner>) => (a: Id, b: Id): number => {
  const x = o.get(a)!;
  const y = o.get(b)!;
  return x.rack.localeCompare(y.rack, 'en', { numeric: true }) || x.name.localeCompare(y.name, 'en', { numeric: true });
};

/** A diagram of the room's cabling, laid out as a tidy tree per connected group. */
export function buildTopology(content: PlanContent): Topology {
  const own = owners(content);
  const order = byPlace(own);
  const neighbours = new Map<Id, Set<Id>>();
  const pairs = new Map<string, NetLink[]>();
  for (const l of content.links) {
    const [a, b] = [l.a.deviceId, l.b.deviceId];
    if (a === b || !own.has(a) || !own.has(b)) continue;
    for (const [x, y] of [[a, b], [b, a]] as const) {
      if (!neighbours.has(x)) neighbours.set(x, new Set());
      neighbours.get(x)!.add(y);
    }
    const key = [a, b].sort().join('|');
    pairs.set(key, [...(pairs.get(key) ?? []), l]);
  }
  const linked = [...neighbours.keys()];
  const degree = (id: Id): number => neighbours.get(id)?.size ?? 0;
  // Switch-like gear: network devices with a real port count, even when they have a single uplink.
  const isSwitch = (id: Id): boolean => own.get(id)!.category === 'network' && own.get(id)!.ports >= SWITCH_MIN_PORTS;
  // A leaf has one cable to gear. Of two plain devices only cabled to each other, the one with more ports is gear.
  const isLeaf = (id: Id): boolean => {
    if (degree(id) !== 1 || isSwitch(id)) return false;
    const other = [...neighbours.get(id)!][0]!;
    if (degree(other) > 1 || isSwitch(other)) return true;
    return own.get(id)!.ports < own.get(other)!.ports || (own.get(id)!.ports === own.get(other)!.ports && order(id, other) > 0);
  };
  const gear = linked.filter((id) => !isLeaf(id));
  const gearSet = new Set(gear);
  const gearDegree = (id: Id): number => [...(neighbours.get(id) ?? [])].filter((n) => gearSet.has(n)).length;

  // Tree: per connected group of gear, aggregators are roots; peers that only link to each other are all roots.
  const parent = new Map<Id, Id>();
  const depth = new Map<Id, number>();
  const roots: Id[] = [];
  const seen = new Set<Id>();
  for (const start of [...gear].sort(order)) {
    if (seen.has(start)) continue;
    const group: Id[] = [];
    const stack = [start];
    seen.add(start);
    while (stack.length) {
      const cur = stack.pop()!;
      group.push(cur);
      for (const n of neighbours.get(cur) ?? []) if (gearSet.has(n) && !seen.has(n)) (seen.add(n), stack.push(n));
    }
    const top = Math.max(...group.map(gearDegree));
    const groupRoots = (top >= 2 ? group.filter((id) => gearDegree(id) === top) : group).sort(order);
    roots.push(...groupRoots);
    const queue = [...groupRoots];
    groupRoots.forEach((r) => depth.set(r, 0));
    while (queue.length) {
      const cur = queue.shift()!;
      for (const n of [...(neighbours.get(cur) ?? [])].sort(order)) {
        if (!gearSet.has(n) || depth.has(n)) continue;
        depth.set(n, depth.get(cur)! + 1);
        parent.set(n, cur);
        queue.push(n);
      }
    }
  }
  for (const id of linked) {
    if (gearSet.has(id)) continue;
    const p = [...neighbours.get(id)!][0]!;
    parent.set(id, p);
    depth.set(id, depth.get(p)! + 1);
  }
  const children = new Map<Id, Id[]>();
  for (const [c, p] of parent) children.set(p, [...(children.get(p) ?? []), c]);
  // Leaves first under each parent, then the gear below it, each in rack order.
  for (const list of children.values()) list.sort((a, b) => Number(gearSet.has(a)) - Number(gearSet.has(b)) || order(a, b));

  const x = new Map<Id, number>();
  const place = (id: Id, left: number): number => {
    const kids = children.get(id) ?? [];
    if (kids.length === 0) {
      x.set(id, left);
      return NODE_W;
    }
    let cursor = left;
    for (const k of kids) cursor += place(k, cursor) + H_GAP;
    const width = Math.max(NODE_W, cursor - H_GAP - left);
    const first = x.get(kids[0]!)!;
    const last = x.get(kids[kids.length - 1]!)!;
    x.set(id, Math.max(left, (first + last) / 2));
    return width;
  };
  let cursor = MARGIN;
  for (const r of roots) cursor += place(r, cursor) + H_GAP * 2;

  const nodes: TopoNode[] = linked.map((id) => {
    const o = own.get(id)!;
    return { id, name: o.name, where: o.where, category: o.category, x: x.get(id)!, y: MARGIN + depth.get(id)! * ROW_H, leaf: !gearSet.has(id) };
  });
  const edges: TopoEdge[] = [...pairs].map(([key, links]) => {
    const [a, b] = key.split('|') as [Id, Id];
    const fibre = links.some((l) => (l.cable && FIBRE_CABLES.has(l.cable)) || [l.a, l.b].some((r) => describeEnd(content, r).port?.media !== 'rj45'));
    const vids = [...new Set(links.flatMap((l) => {
      const va = carriedVids(content, describeEnd(content, l.a).port?.vlan);
      const vb = carriedVids(content, describeEnd(content, l.b).port?.vlan);
      return va.filter((v) => vb.includes(v));
    }))].sort((p, q) => p - q);
    return { key, a, b, links, fibre, tree: parent.get(a) === b || parent.get(b) === a, vids };
  });
  const unlinked = [...own.values()]
    .filter((o) => o.ports > 0 && !neighbours.has(o.id))
    .sort((p, q) => order(p.id, q.id))
    .map((o) => ({ id: o.id, name: o.name, where: o.where }));
  const width = Math.max(...nodes.map((n) => n.x + NODE_W), 0) + MARGIN;
  const height = Math.max(...nodes.map((n) => n.y + NODE_H), 0) + MARGIN;
  return { nodes, edges, width, height, unlinked };
}

/** Is this node (or a cable of this edge) in VLAN `vid`? */
export function nodeCarries(content: PlanContent, id: Id, vid: number): boolean {
  const ports = findRackDevice(content, id)?.device.ports ?? findNode(content, id)?.node.ports ?? [];
  return ports.some((p) => carriedVids(content, p.vlan).includes(vid));
}
