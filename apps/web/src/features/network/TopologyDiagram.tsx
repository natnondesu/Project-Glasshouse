import { describeEnd, type EquipmentState, type Id, type PlanContent } from '@glasshouse/domain';
import type { KeyboardEvent } from 'react';
import { useT } from '../../i18n';
import { StateGlyph } from '../../ui/StateIcon';
import { NODE_H, NODE_W, nodeCarries, type TopoEdge, type TopoNode, type Topology } from './topology';
import { portTags, type PortTag } from './portTags';

export type TopoSelection = { kind: 'node'; id: Id } | { kind: 'edge'; key: string } | null;

interface TopologyDiagramProps {
  content: PlanContent;
  topology: Topology;
  /** Highlighted VLAN: cables and devices that don't carry it fade. */
  vid?: number | null;
  scale?: number;
  selection?: TopoSelection;
  onSelect?: (s: TopoSelection) => void;
  stateOf?: (id: Id) => EquipmentState;
  /** Print: fills the page width and isn't interactive. */
  isStatic?: boolean;
}

const mid = (n: TopoNode): [number, number] => [n.x + NODE_W / 2, n.y + NODE_H / 2];
/** Vertical space between a parent and its first row (ROW_H minus a node). */
const ROW_H_GAP = 120 - NODE_H;

/** Gap between a wrapped leaf block and its spine, so the spine never touches a box. */
const SPINE_GAP = 11;

function edgePath(a: TopoNode, b: TopoNode, tree: boolean): string {
  if (tree) {
    const [top, bottom] = a.y <= b.y ? [a, b] : [b, a];
    if (bottom.leaf && bottom.leafRow > 0) {
      // Org-chart spine: down from the parent, along the block's left edge, then into the wrapped row.
      const x1 = top.x + NODE_W / 2;
      const y1 = top.y + NODE_H;
      const firstBus = y1 + (ROW_H_GAP / 2);
      const spine = bottom.blockLeft - SPINE_GAP;
      const rowBus = bottom.y - 17;
      const x2 = bottom.x + NODE_W / 2;
      return `M${x1} ${y1} V${firstBus} H${spine} V${rowBus} H${x2} V${bottom.y}`;
    }
    const x1 = top.x + NODE_W / 2;
    const y1 = top.y + NODE_H;
    const x2 = bottom.x + NODE_W / 2;
    const y2 = bottom.y;
    const bus = y1 + (y2 - y1) / 2;
    return `M${x1} ${y1} V${bus} H${x2} V${y2}`;
  }
  if (a.y === b.y) {
    const [l, r] = a.x <= b.x ? [a, b] : [b, a];
    return `M${l.x + NODE_W} ${l.y + NODE_H / 2} H${r.x}`;
  }
  const [x1, y1] = mid(a);
  const [x2, y2] = mid(b);
  return `M${x1} ${y1} L${x2} ${y2}`;
}

/** Where a cable count sits: on the elbow's bus for tree edges, mid-line otherwise. */
function badgeAt(a: TopoNode, b: TopoNode, tree: boolean): [number, number] {
  if (tree) {
    const [top, bottom] = a.y <= b.y ? [a, b] : [b, a];
    return [bottom.x + NODE_W / 2, top.y + NODE_H + (bottom.y - top.y - NODE_H) / 2 + (bottom.y - top.y - NODE_H) / 4];
  }
  const [x1, y1] = mid(a);
  const [x2, y2] = mid(b);
  return [(x1 + x2) / 2, (y1 + y2) / 2];
}

export function TopologyDiagram({ content, topology, vid = null, scale = 1, selection = null, onSelect, stateOf, isStatic = false }: TopologyDiagramProps) {
  const m = useT();
  const byId = new Map(topology.nodes.map((n) => [n.id, n]));
  const act = (s: TopoSelection) => (isStatic || !onSelect ? {} : { role: 'button', tabIndex: 0, onClick: () => onSelect(s), onKeyDown: (e: KeyboardEvent) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onSelect(s)) });
  // A selected device pulls its own cables and neighbours forward; everything else steps back.
  const focusId = selection?.kind === 'node' && !isStatic ? selection.id : null;
  const touches = (e: TopoEdge): boolean => focusId !== null && (e.a === focusId || e.b === focusId);
  const neighbours = new Set(focusId ? topology.edges.filter(touches).flatMap((e) => [e.a, e.b]) : []);
  const dimEdge = (e: TopoEdge): boolean => (vid !== null && !e.vids.includes(vid)) || (focusId !== null && !touches(e));
  const dimNode = (n: TopoNode): boolean => (vid !== null && !nodeCarries(content, n.id, vid)) || (focusId !== null && n.id !== focusId && !neighbours.has(n.id));
  const lagAt = (r: { deviceId: Id; port: string }): string | undefined => describeEnd(content, r).port?.lag;
  const tags = focusId ? portTags(focusId, topology.edges, byId, m.topology.morePorts, lagAt, m.topology.links) : [];
  // One LAG on either end: the bundle is named after it.
  const bundleName = (e: TopoEdge): string | null => {
    for (const device of [e.a, e.b]) {
      const lags = new Set(e.links.map((l) => lagAt(l.a.deviceId === device ? l.a : l.b)));
      const [only] = lags;
      if (lags.size === 1 && only) return only;
    }
    return null;
  };
  return (
    <svg
      className={`topo${isStatic ? ' topo--static' : ''}`}
      role={isStatic ? 'img' : 'group'}
      aria-label={m.topology.diagram}
      width={isStatic ? '100%' : topology.width * scale}
      height={isStatic ? undefined : topology.height * scale}
      viewBox={`0 0 ${topology.width} ${topology.height}`}
    >
      {topology.edges.map((e) => {
        const a = byId.get(e.a)!;
        const b = byId.get(e.b)!;
        const selected = selection?.kind === 'edge' && selection.key === e.key;
        const [bx, by] = badgeAt(a, b, e.tree);
        return (
          <g
            key={e.key}
            className={`topo-edge${e.fibre ? ' is-fibre' : ''}${dimEdge(e) ? ' is-dim' : ''}${selected ? ' is-selected' : ''}${touches(e) ? ' is-focus' : ''}`}
            aria-label={isStatic ? undefined : m.topology.edgeLabel(a.name, b.name, e.links.length)}
            aria-pressed={isStatic ? undefined : selected}
            {...act({ kind: 'edge', key: e.key })}
          >
            <title>{e.links.map((l) => `${a.id === l.a.deviceId ? a.name : b.name} ${l.a.port} ↔ ${a.id === l.b.deviceId ? a.name : b.name} ${l.b.port}${l.label ? ` · ${l.label}` : ''}`).join('\n')}</title>
            <path className="topo-edge__hit" d={edgePath(a, b, e.tree)} />
            <path className="topo-edge__line" d={edgePath(a, b, e.tree)} />
            {e.links.length > 1 ? (
              <BundleBadge x={bx} y={by} text={`${bundleName(e) ? `${bundleName(e)} ` : ''}×${e.links.length}`} />
            ) : null}
          </g>
        );
      })}
      {topology.nodes.map((n) => {
        const selected = selection?.kind === 'node' && selection.id === n.id;
        const state = stateOf?.(n.id) ?? 'planned';
        return (
          <g
            key={n.id}
            className={`topo-node topo-node--${n.category}${n.leaf ? ' is-leaf' : ''}${dimNode(n) ? ' is-dim' : ''}${selected ? ' is-selected' : ''}${focusId && n.id !== focusId && neighbours.has(n.id) ? ' is-neighbour' : ''}`}
            data-topo-id={n.id}
            aria-label={isStatic ? undefined : m.topology.deviceLabel(n.name, n.where)}
            aria-pressed={isStatic ? undefined : selected}
            {...act({ kind: 'node', id: n.id })}
          >
            <rect className="topo-node__body" x={n.x} y={n.y} width={NODE_W} height={NODE_H} rx={8} />
            <rect className="topo-node__stripe" x={n.x} y={n.y} width={5} height={NODE_H} rx={2} />
            <StateGlyph state={state} cx={n.x + 16} cy={n.y + 17} className="topo-node__state" />
            <text className="topo-node__name" x={n.x + 26} y={n.y + 21}>
              {n.name}
            </text>
            <text className="topo-node__where" x={n.x + 26} y={n.y + 38}>
              {n.where}
            </text>
          </g>
        );
      })}
      {tags.map((t) => (
        <PortTagLabel key={t.key} tag={t} />
      ))}
    </svg>
  );
}

/** 13px Geist Mono advance: diagram labels stay at the 11px floor at the 85% fit. */
const BADGE_CHAR_PX = 7.9;

/** The cable count on a bundle, named after its LAG when it has one. */
function BundleBadge({ x, y, text }: { x: number; y: number; text: string }) {
  const w = Math.max(26, text.length * BADGE_CHAR_PX + 12);
  return (
    <g className="topo-edge__badge">
      <rect x={x - w / 2} y={y - 10} width={w} height={20} rx={10} />
      <text x={x} y={y + 5} textAnchor="middle">
        {text}
      </text>
    </g>
  );
}

const TAG_LINE_H = 16;
const TAG_CHAR_PX = 7.9;
const TAG_PAD = 5;

/** Port pairs on a paper chip, so they read over lines and boxes. */
function PortTagLabel({ tag }: { tag: PortTag }) {
  const w = Math.max(...tag.lines.map((l) => l.length)) * TAG_CHAR_PX + TAG_PAD * 2;
  const h = tag.lines.length * TAG_LINE_H + TAG_PAD;
  const left = tag.anchor === 'start' ? tag.x : tag.anchor === 'end' ? tag.x - w : tag.x - w / 2;
  const top = tag.up ? tag.y - h : tag.y - TAG_LINE_H + 2;
  const textX = tag.anchor === 'middle' ? tag.x : tag.anchor === 'start' ? left + TAG_PAD : left + w - TAG_PAD;
  return (
    <g className="topo-tag" aria-hidden="true">
      <rect x={left} y={top} width={w} height={h} rx={4} />
      {tag.lines.map((line, i) => (
        <text key={i} x={textX} y={top + TAG_PAD / 2 + TAG_LINE_H * (i + 1) - 3} textAnchor={tag.anchor}>
          {line}
        </text>
      ))}
    </g>
  );
}
