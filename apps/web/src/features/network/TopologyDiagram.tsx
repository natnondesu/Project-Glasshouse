import type { EquipmentState, Id, PlanContent } from '@glasshouse/domain';
import type { KeyboardEvent } from 'react';
import { useT } from '../../i18n';
import { STATE_SYMBOL } from '../elevation/EquipmentStateControl';
import { NODE_H, NODE_W, nodeCarries, type TopoEdge, type TopoNode, type Topology } from './topology';

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
  const dimEdge = (e: TopoEdge): boolean => vid !== null && !e.vids.includes(vid);
  const dimNode = (n: TopoNode): boolean => vid !== null && !nodeCarries(content, n.id, vid);
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
            className={`topo-edge${e.fibre ? ' is-fibre' : ''}${dimEdge(e) ? ' is-dim' : ''}${selected ? ' is-selected' : ''}`}
            aria-label={isStatic ? undefined : m.topology.edgeLabel(a.name, b.name, e.links.length)}
            aria-pressed={isStatic ? undefined : selected}
            {...act({ kind: 'edge', key: e.key })}
          >
            <title>{e.links.map((l) => `${a.id === l.a.deviceId ? a.name : b.name} ${l.a.port} ↔ ${a.id === l.b.deviceId ? a.name : b.name} ${l.b.port}${l.label ? ` · ${l.label}` : ''}`).join('\n')}</title>
            <path className="topo-edge__hit" d={edgePath(a, b, e.tree)} />
            <path className="topo-edge__line" d={edgePath(a, b, e.tree)} />
            {e.links.length > 1 ? (
              <g className="topo-edge__badge">
                <rect x={bx - 13} y={by - 9} width={26} height={18} rx={9} />
                <text x={bx} y={by + 4} textAnchor="middle">{`×${e.links.length}`}</text>
              </g>
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
            className={`topo-node topo-node--${n.category}${n.leaf ? ' is-leaf' : ''}${dimNode(n) ? ' is-dim' : ''}${selected ? ' is-selected' : ''}`}
            data-topo-id={n.id}
            aria-label={isStatic ? undefined : m.topology.deviceLabel(n.name, n.where)}
            aria-pressed={isStatic ? undefined : selected}
            {...act({ kind: 'node', id: n.id })}
          >
            <rect className="topo-node__body" x={n.x} y={n.y} width={NODE_W} height={NODE_H} rx={8} />
            <rect className="topo-node__stripe" x={n.x} y={n.y} width={5} height={NODE_H} rx={2} />
            <text className="topo-node__state" x={n.x + 16} y={n.y + 21} textAnchor="middle">
              {STATE_SYMBOL[state]}
            </text>
            <text className="topo-node__name" x={n.x + 26} y={n.y + 21}>
              {n.name}
            </text>
            <text className="topo-node__where" x={n.x + 26} y={n.y + 38}>
              {n.where}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
