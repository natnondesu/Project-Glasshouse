import { carriedVids, describeEnd, effectiveVlan, findNode, findRackDevice, racksOf, stacksOf, type Category, type Id, type NetLink, type PlanContent } from '@glasshouse/domain';

/** The smallest box; every box in one diagram grows together to its longest name. */
export const NODE_W = 152;
export const NODE_H = 50;
/** 13px Geist Mono advance (bold names are the same width). */
const CHAR_PX = 7.9;
/** Text starts after the stripe and state glyph; a little air on the right. */
const TEXT_LEFT = 26;
const TEXT_RIGHT = 12;
/** Past this many characters a line wraps rather than widening every box further. */
const MAX_LINE_CHARS = 26;
const FIRST_BASELINE = 21;
const LINE_STEP = 17;
const BOTTOM_PAD = 12;
/** Between a core pair: room for the bundle badge ('Po1 ×2') on the link that joins them. */
const PAIR_GAP = 84;
const H_GAP = 22;
/** Space between a parent's box and its children's row; the elbow runs through it. */
export const ROW_GAP = 70;
/** Space between wrapped rows of leaves under one parent: room for a two-line port tag. */
const LEAF_ROW_GAP = 46;
const DEFAULT_LEAF_COLS = 6;
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
  /** Box size, the same for every node in a diagram. */
  w: number;
  h: number;
  /** Name and place, wrapped to the box width. */
  nameLines: string[];
  whereLines: string[];
  /** Leaves hang off one other device (a server on its switch); the rest is network gear. */
  leaf: boolean;
  /** Wrapped row of a leaf under its parent (0 = first), and the left edge of that leaf block. */
  leafRow: number;
  blockLeft: number;
  /** With leaves folded away (a big room on paper): how many hung off this device. */
  leafCount: number;
  /** A switch stack drawn as one box: its members' device IDs, in member order, and how many stack cables join them. */
  memberIds?: Id[];
  ring?: number;
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
  /** Single-cable devices are folded into counts on their switches (print, big rooms). */
  collapsed: boolean;
  /** Devices with ports but no cables, listed beside the diagram. */
  unlinked: { id: Id; name: string; where: string }[];
}

/**
 * Splits text into lines of at most `max` characters, preferring breaks after '-', '_', '.', '/'
 * or a space so names break where people read them. Never cuts characters away.
 */
export function wrapLabel(text: string, max: number): string[] {
  const lines: string[] = [];
  let rest = text;
  while (rest.length > max) {
    const window = rest.slice(0, max + 1);
    const space = window.lastIndexOf(' ');
    const mark = Math.max(...['-', '_', '.', '/'].map((c) => window.slice(0, max).lastIndexOf(c)));
    const cut = space > 0 ? space : mark > 0 ? mark + 1 : max;
    lines.push(rest.slice(0, cut).trimEnd());
    rest = rest.slice(cut).trimStart();
  }
  lines.push(rest);
  return lines;
}

/** One box size for the whole diagram, so rows stay aligned: fits the longest line, wrapping past the cap. */
function boxSize(labels: { name: string; where: string }[], extraLines = 0): { w: number; h: number; chars: number } {
  const longest = Math.max(0, ...labels.flatMap((l) => [l.name.length, l.where.length]));
  const chars = Math.min(longest, MAX_LINE_CHARS);
  const w = Math.max(NODE_W, Math.ceil(TEXT_LEFT + chars * CHAR_PX + TEXT_RIGHT));
  const lines = Math.max(2, ...labels.map((l) => wrapLabel(l.name, chars || 1).length + wrapLabel(l.where, chars || 1).length)) + extraLines;
  return { w, h: Math.max(NODE_H, FIRST_BASELINE + (lines - 1) * LINE_STEP + BOTTOM_PAD), chars };
}

const FIBRE_CABLES = new Set(['om3', 'om4', 'os2', 'aoc']);

interface Owner {
  id: Id;
  name: string;
  where: string;
  category: Category | 'node';
  rack: string;
  ports: number;
  /** Stacks only: one line per member ("1  ICON-CS-B10-01"), and the member device IDs. */
  memberLines?: string[];
  memberIds?: Id[];
}

/** Devices, chassis and nodes that have a place; a stack stands in for its members (the alias map). */
function owners(content: PlanContent): { own: Map<Id, Owner>; alias: Map<Id, Id> } {
  const out = new Map<Id, Owner>();
  for (const rack of racksOf(content)) {
    for (const d of rack.devices) {
      const u = d.heightU === 1 ? `U${d.bottomU}` : `U${d.bottomU}–U${d.bottomU + d.heightU - 1}`;
      out.set(d.id, { id: d.id, name: d.name, where: `${rack.name} · ${u}`, category: d.kind === 'chassis' ? 'chassis' : d.category, rack: rack.name, ports: d.ports?.length ?? 0 });
      if (d.kind === 'chassis') for (const n of d.nodes) out.set(n.id, { id: n.id, name: n.name, where: `${d.name} slot ${n.slot}`, category: 'node', rack: rack.name, ports: n.ports?.length ?? 0 });
    }
  }
  const alias = new Map<Id, Id>();
  for (const st of stacksOf(content)) {
    const members = st.members.filter((m) => out.has(m.deviceId));
    if (members.length === 0) continue;
    for (const m of members) alias.set(m.deviceId, st.id);
    const first = out.get(members[0]!.deviceId)!;
    out.set(st.id, {
      id: st.id,
      name: `STACK ${st.name}`,
      where: '',
      category: 'network',
      rack: first.rack,
      ports: members.reduce((n, m) => n + out.get(m.deviceId)!.ports, 0),
      memberLines: members.map((m) => `${m.member}  ${out.get(m.deviceId)!.name}`),
      memberIds: members.map((m) => m.deviceId),
    });
  }
  return { own: out, alias };
}

const byPlace = (o: Map<Id, Owner>) => (a: Id, b: Id): number => {
  const x = o.get(a)!;
  const y = o.get(b)!;
  return x.rack.localeCompare(y.rack, 'en', { numeric: true }) || x.name.localeCompare(y.name, 'en', { numeric: true });
};

/** A diagram of the room's cabling, laid out as a tidy tree per connected group. */
/**
 * `collapseLeaves` draws only the network gear, each box counting the single-cable devices under it:
 * for paper, where a big room's every server can't fit one page at a readable size.
 */
export function buildTopology(content: PlanContent, { leafCols = DEFAULT_LEAF_COLS, collapseLeaves = false }: { leafCols?: number; collapseLeaves?: boolean } = {}): Topology {
  const { own, alias } = owners(content);
  const as = (id: Id): Id => alias.get(id) ?? id;
  const order = byPlace(own);
  // Cables between members of one stack are its stack ring, counted on the stack's box rather than drawn.
  const ring = new Map<Id, number>();
  const neighbours = new Map<Id, Set<Id>>();
  const pairs = new Map<string, NetLink[]>();
  for (const l of content.links) {
    const [a, b] = [as(l.a.deviceId), as(l.b.deviceId)];
    if (a === b && own.get(a)?.memberIds) ring.set(a, (ring.get(a) ?? 0) + 1);
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

  const shown = collapseLeaves ? linked.filter((id) => gearSet.has(id)) : linked;
  const leafCount = (id: Id): number => (collapseLeaves ? (children.get(id) ?? []).filter((k) => !gearSet.has(k)).length : 0);
  const extra = collapseLeaves && shown.some((id) => leafCount(id) > 0) ? 1 : 0;
  // A stack's box is as wide as its longest member line; every box shares that width.
  const box = boxSize(shown.map((id) => {
    const o = own.get(id)!;
    return o.memberLines ? { name: o.name, where: o.memberLines.reduce((a, b) => (b.length > a.length ? b : a), '') } : o;
  }), extra);
  const nodeW = box.w;
  const LEAF_ROW_H = box.h + LEAF_ROW_GAP;
  const textOf = (id: Id): { nameLines: string[]; whereLines: string[] } => {
    const o = own.get(id)!;
    const chars = box.chars || 1;
    return { nameLines: wrapLabel(o.name, chars), whereLines: o.memberLines ? o.memberLines.flatMap((l) => wrapLabel(l, chars)) : wrapLabel(o.where, chars) };
  };
  // Only a stack's box grows (a line per member, and its ring); the rest keep the shared height.
  const heightOf = (id: Id): number => {
    if (!own.get(id)!.memberLines) return box.h;
    const t = textOf(id);
    const lines = t.nameLines.length + t.whereLines.length + (ring.get(id) ? 1 : 0) + extra;
    return Math.max(box.h, FIRST_BASELINE + (lines - 1) * LINE_STEP + BOTTOM_PAD);
  };
  const x = new Map<Id, number>();
  const leafRow = new Map<Id, number>();
  const blockLeft = new Map<Id, number>();
  const place = (id: Id, left: number): number => {
    const kids = (children.get(id) ?? []).filter((k) => !collapseLeaves || gearSet.has(k));
    if (kids.length === 0) {
      x.set(id, left);
      return nodeW;
    }
    // Leaves wrap into rows of `leafCols`, so a 40-server switch stays readable instead of 7 000 px wide.
    const leaves = kids.filter((k) => !gearSet.has(k));
    const gearKids = kids.filter((k) => gearSet.has(k));
    let cursor = left;
    if (leaves.length) {
      const cols = Math.max(1, Math.min(leafCols, leaves.length));
      leaves.forEach((k, i) => {
        x.set(k, left + (i % cols) * (nodeW + H_GAP));
        leafRow.set(k, Math.floor(i / cols));
        blockLeft.set(k, left);
      });
      cursor = left + cols * (nodeW + H_GAP);
    }
    for (const k of gearKids) cursor += place(k, cursor) + H_GAP;
    const width = Math.max(nodeW, cursor - H_GAP - left);
    const firstRow = kids.filter((k) => (leafRow.get(k) ?? 0) === 0);
    const first = x.get(firstRow[0]!)!;
    const last = x.get(firstRow[firstRow.length - 1]!)!;
    x.set(id, Math.max(left, (first + last) / 2));
    return width;
  };
  // A root with no tree of its own whose links all reach another root's tree (a core pair in MLAG)
  // sits beside its partner, the pair centred over what they share, instead of off to one side.
  const anchorOf = new Map<Id, Id>();
  for (const r of roots) {
    if ((children.get(r) ?? []).length > 0) continue;
    const partner = roots.find((o) => o !== r && (children.get(o) ?? []).length > 0 && neighbours.get(r)?.has(o));
    if (partner) anchorOf.set(r, partner);
  }
  let cursor = MARGIN;
  for (const r of roots) if (!anchorOf.has(r)) cursor += place(r, cursor) + H_GAP * 2;
  for (const anchor of new Set(anchorOf.values())) {
    const row = [anchor, ...[...anchorOf].filter(([, a]) => a === anchor).map(([r]) => r)];
    const centre = x.get(anchor)! + nodeW / 2;
    const span = row.length * nodeW + (row.length - 1) * PAIR_GAP;
    const left = Math.max(MARGIN, centre - span / 2);
    row.forEach((id, i) => x.set(id, left + i * (nodeW + PAIR_GAP)));
  }

  // Rows of the tree are as tall as their tallest box, so a stack pushes only the rows below it down.
  const rowH = new Map<number, number>();
  for (const id of shown) if ((leafRow.get(id) ?? 0) === 0) rowH.set(depth.get(id)!, Math.max(rowH.get(depth.get(id)!) ?? 0, heightOf(id)));
  const rowTop = (d: number): number => {
    let y = MARGIN;
    for (let k = 0; k < d; k += 1) y += (rowH.get(k) ?? box.h) + ROW_GAP;
    return y;
  };
  const nodes: TopoNode[] = shown.map((id) => {
    const o = own.get(id)!;
    const row = leafRow.get(id) ?? 0;
    return {
      id,
      name: o.name,
      where: o.where,
      category: o.category,
      x: x.get(id)!,
      y: rowTop(depth.get(id)!) + row * LEAF_ROW_H,
      w: box.w,
      h: heightOf(id),
      ...textOf(id),
      leaf: !gearSet.has(id),
      leafRow: row,
      blockLeft: blockLeft.get(id) ?? x.get(id)!,
      leafCount: leafCount(id),
      ...(o.memberIds ? { memberIds: o.memberIds, ring: ring.get(id) ?? 0 } : {}),
    };
  });
  const visible = new Set(shown);
  const edges: TopoEdge[] = [...pairs].filter(([key]) => key.split('|').every((id) => visible.has(id))).map(([key, links]) => {
    const [a, b] = key.split('|') as [Id, Id];
    const fibre = links.some((l) => (l.cable && FIBRE_CABLES.has(l.cable)) || [l.a, l.b].some((r) => describeEnd(content, r).port?.media !== 'rj45'));
    const vids = [...new Set(links.flatMap((l) => {
      // A server end with no VLAN of its own carries its switch port's, so the cable still lights up.
      const va = carriedVids(content, effectiveVlan(content, l.a)?.vlan);
      const vb = carriedVids(content, effectiveVlan(content, l.b)?.vlan);
      return va.filter((v) => vb.includes(v));
    }))].sort((p, q) => p - q);
    return { key, a, b, links, fibre, tree: parent.get(a) === b || parent.get(b) === a, vids };
  });
  // A stack lists as one when it has no cables; its members are covered by it.
  const unlinked = [...own.values()]
    .filter((o) => !o.memberIds && o.ports > 0 && !neighbours.has(as(o.id)))
    .sort((p, q) => order(p.id, q.id))
    .map((o) => ({ id: o.id, name: o.name, where: o.where }));
  const width = Math.max(...nodes.map((n) => n.x + n.w), 0) + MARGIN;
  const height = Math.max(...nodes.map((n) => n.y + n.h), 0) + MARGIN;
  return { nodes, edges, width, height, unlinked, collapsed: collapseLeaves };
}

/** Is this node (or a cable of this edge) in VLAN `vid`? */
export function nodeCarries(content: PlanContent, id: Id, vid: number): boolean {
  const stack = stacksOf(content).find((s) => s.id === id);
  if (stack) return stack.members.some((m) => nodeCarries(content, m.deviceId, vid));
  const ports = findRackDevice(content, id)?.device.ports ?? findNode(content, id)?.node.ports ?? [];
  return ports.some((p) => carriedVids(content, effectiveVlan(content, { deviceId: id, port: p.name })?.vlan).includes(vid));
}

/**
 * The leaf wrapping whose shape best fits a view of `viewW` × `viewH`: a big room becomes a block
 * you scroll a little both ways instead of a strip many screens wide.
 */
export function shapedTopology(content: PlanContent, viewW: number, viewH: number): Topology {
  let best: { t: Topology; fit: number } | null = null;
  for (const leafCols of [6, 4, 3, 2]) {
    const t = buildTopology(content, { leafCols });
    const fit = Math.min(viewW / Math.max(t.width, 1), viewH / Math.max(t.height, 1));
    // Fewer columns only when the shape is clearly better: wrapping costs vertical reading.
    if (!best || fit > best.fit * 1.15) best = { t, fit };
  }
  return best!.t;
}

/** For print: the widest leaf wrapping that fits `maxWidth` × `maxHeight` at full size, or null. */
export function fitTopology(content: PlanContent, maxWidth: number, maxHeight = Infinity): Topology | null {
  for (const leafCols of [6, 4, 3, 2]) {
    const t = buildTopology(content, { leafCols });
    if (t.width <= maxWidth && t.height <= maxHeight) return t;
  }
  return null;
}
