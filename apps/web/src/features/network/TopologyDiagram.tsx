import { describeEnd, stacksOf, type EquipmentState, type Id, type PlanContent } from '@glasshouse/domain';
import type { KeyboardEvent } from 'react';
import { useT } from '../../i18n';
import { StateGlyph } from '../../ui/StateIcon';
import { nodeCarries, ROW_GAP, type TopoEdge, type TopoNode, type Topology } from './topology';
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
  /** A search hit's box, ringed for a moment. */
  pulseId?: Id | null;
}

const mid = (n: TopoNode): [number, number] => [n.x + n.w / 2, n.y + n.h / 2];
const NAME_BASELINE = 21;
const LINE_STEP = 17;

/** Gap between a wrapped leaf block and its spine, so the spine never touches a box. */
const SPINE_GAP = 11;
/** How far above a wrapped leaf its row bus runs; the line drops from there into the box. */
const ROW_BUS_ABOVE = 17;

const isWrapped = (n: TopoNode): boolean => n.leaf && n.leafRow > 0;

function edgePath(a: TopoNode, b: TopoNode, tree: boolean): string {
  if (tree) {
    const [top, bottom] = a.y <= b.y ? [a, b] : [b, a];
    if (isWrapped(bottom)) {
      // Org-chart spine: down from the parent, along the block's left edge, then into the wrapped row.
      const x1 = top.x + top.w / 2;
      const y1 = top.y + top.h;
      const firstBus = y1 + (ROW_GAP / 2);
      const spine = bottom.blockLeft - SPINE_GAP;
      const rowBus = bottom.y - ROW_BUS_ABOVE;
      const x2 = bottom.x + bottom.w / 2;
      return `M${x1} ${y1} V${firstBus} H${spine} V${rowBus} H${x2} V${bottom.y}`;
    }
    const x1 = top.x + top.w / 2;
    const y1 = top.y + top.h;
    const x2 = bottom.x + bottom.w / 2;
    const y2 = bottom.y;
    const bus = y1 + (y2 - y1) / 2;
    return `M${x1} ${y1} V${bus} H${x2} V${y2}`;
  }
  if (a.y === b.y) {
    const [l, r] = a.x <= b.x ? [a, b] : [b, a];
    return `M${l.x + l.w} ${l.y + l.h / 2} H${r.x}`;
  }
  const [x1, y1] = mid(a);
  const [x2, y2] = mid(b);
  return `M${x1} ${y1} L${x2} ${y2}`;
}

/** Where a cable count sits: on the drop into the child for tree edges, mid-line otherwise. */
export function badgeAt(a: TopoNode, b: TopoNode, tree: boolean): [number, number] {
  if (tree) {
    const [top, bottom] = a.y <= b.y ? [a, b] : [b, a];
    // A wrapped leaf's line comes down the spine and drops in from its own row bus: the pill sits on that
    // drop, not partway down the parent's drop, which would land inside a box in an earlier row.
    if (isWrapped(bottom)) return [bottom.x + bottom.w / 2, bottom.y - ROW_BUS_ABOVE / 2];
    return [bottom.x + bottom.w / 2, top.y + top.h + (bottom.y - top.y - top.h) / 2 + (bottom.y - top.y - top.h) / 4];
  }
  const [x1, y1] = mid(a);
  const [x2, y2] = mid(b);
  return [(x1 + x2) / 2, (y1 + y2) / 2];
}

export function TopologyDiagram({ content, topology, vid = null, scale = 1, selection = null, onSelect, stateOf, isStatic = false, pulseId = null }: TopologyDiagramProps) {
  const m = useT();
  const byId = new Map(topology.nodes.map((n) => [n.id, n]));
  // An uplink's far device isn't in this room: its box knows its name.
  const endName = (r: { deviceId: Id; port: string }): string => (describeEnd(content, r).port ? describeEnd(content, r).device : (byId.get(r.deviceId)?.name ?? describeEnd(content, r).device));
  const inMaint = (id: Id): boolean => (byId.get(id)?.memberIds ?? [id]).some((x) => stateOf?.(x) === 'maintenance');
  const act = (s: TopoSelection) => (isStatic || !onSelect ? {} : { role: 'button', tabIndex: 0, onClick: () => onSelect(s), onKeyDown: (e: KeyboardEvent) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onSelect(s)) });
  // A selected device pulls its own cables and neighbours forward; everything else steps back.
  const focusId = selection?.kind === 'node' && !isStatic ? selection.id : null;
  const touches = (e: TopoEdge): boolean => focusId !== null && (e.a === focusId || e.b === focusId);
  const neighbours = new Set(focusId ? topology.edges.filter(touches).flatMap((e) => [e.a, e.b]) : []);
  const dimEdge = (e: TopoEdge): boolean => (vid !== null && !e.vids.includes(vid)) || (focusId !== null && !touches(e));
  const dimNode = (n: TopoNode): boolean => (vid !== null && !nodeCarries(content, n.id, vid)) || (focusId !== null && n.id !== focusId && !neighbours.has(n.id));
  const lagAt = (r: { deviceId: Id; port: string }): string | undefined => describeEnd(content, r).port?.lag;
  const ownerOf = new Map(topology.nodes.flatMap((n) => (n.memberIds ?? []).map((id) => [id, n.id] as const)));
  const memberNo = new Map(stacksOf(content).flatMap((st) => st.members.map((x) => [x.deviceId, x.member] as const)));
  const tags = focusId ? portTags(focusId, topology.edges, byId, m.topology.morePorts, lagAt, m.topology.links, (id) => ownerOf.get(id) ?? id, (id) => memberNo.get(id) ?? null) : [];
  // One LAG on either end: the bundle is named after it.
  const bundleName = (e: TopoEdge): string | null => {
    for (const device of [e.a, e.b]) {
      const lags = new Set(e.links.map((l) => lagAt((ownerOf.get(l.a.deviceId) ?? l.a.deviceId) === device ? l.a : l.b)));
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
            className={`topo-edge${e.fibre ? ' is-fibre' : ''}${byId.get(e.a)?.remoteRoomId || byId.get(e.b)?.remoteRoomId ? ' is-uplink' : ''}${inMaint(e.a) || inMaint(e.b) ? ' is-maint' : ''}${dimEdge(e) ? ' is-dim' : ''}${selected ? ' is-selected' : ''}${touches(e) ? ' is-focus' : ''}`}
            aria-label={isStatic ? undefined : m.topology.edgeLabel(a.name, b.name, e.links.length)}
            aria-pressed={isStatic ? undefined : selected}
            {...act({ kind: 'edge', key: e.key })}
          >
            <title>{e.links.map((l) => `${endName(l.a)} ${l.a.port} ↔ ${endName(l.b)} ${l.b.port}${l.label ? ` · ${l.label}` : ''}`).join('\n')}</title>
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
        // A stack reads as its members: any in maintenance marks it; deployed only when all are.
        const states = (n.memberIds ?? [n.id]).map((id) => stateOf?.(id) ?? 'planned');
        const state = states.includes('maintenance') ? 'maintenance' : states.every((x) => x === 'deployed') ? 'deployed' : 'planned';
        return (
          <g
            key={n.id}
            className={`topo-node topo-node--${n.category}${n.id === pulseId ? ' is-search-pulse' : ''}${n.memberIds ? ' is-stack' : ''}${state === 'maintenance' ? ' is-maint' : ''}${n.leaf ? ' is-leaf' : ''}${dimNode(n) ? ' is-dim' : ''}${selected ? ' is-selected' : ''}${focusId && n.id !== focusId && neighbours.has(n.id) ? ' is-neighbour' : ''}`}
            data-topo-id={n.id}
            aria-label={isStatic ? undefined : `${m.topology.deviceLabel(n.name, n.memberIds ? n.whereLines.join(', ') : n.where)}${state === 'maintenance' ? `, ${m.equipment.state.maintenance}` : ''}`}
            aria-pressed={isStatic ? undefined : selected}
            {...act({ kind: 'node', id: n.id })}
          >
            {n.memberIds ? <rect className="topo-node__stack-back" x={n.x + 5} y={n.y + 5} width={n.w} height={n.h} rx={8} /> : null}
            <rect className="topo-node__body" x={n.x} y={n.y} width={n.w} height={n.h} rx={8} />
            <rect className="topo-node__stripe" x={n.x} y={n.y} width={5} height={n.h} rx={2} />
            <StateGlyph state={state} cx={n.x + 16} cy={n.y + 17} className="topo-node__state" />
            {state === 'maintenance' ? <MaintTab x={n.x + n.w} y={n.y} text={m.equipment.state.maintenance} /> : null}
            <text className="topo-node__name" x={n.x + 26} y={n.y + NAME_BASELINE}>
              {n.nameLines.map((line, i) => (
                <tspan key={i} x={n.x + 26} dy={i === 0 ? 0 : LINE_STEP}>
                  {line}
                </tspan>
              ))}
            </text>
            <text className="topo-node__where" x={n.x + 26} y={n.y + NAME_BASELINE + n.nameLines.length * LINE_STEP}>
              {n.whereLines.map((line, i) => (
                <tspan key={i} x={n.x + 26} dy={i === 0 ? 0 : LINE_STEP}>
                  {line}
                </tspan>
              ))}
            </text>
            {n.ring ? (
              <text className="topo-node__ring" x={n.x + 26} y={n.y + NAME_BASELINE + (n.nameLines.length + n.whereLines.length) * LINE_STEP}>
                {m.stack.ring(n.ring)}
              </text>
            ) : null}
            {n.leafCount > 0 ? (
              <text className="topo-node__count" x={n.x + 26} y={n.y + NAME_BASELINE + (n.nameLines.length + n.whereLines.length + (n.ring ? 1 : 0)) * LINE_STEP}>
                {m.topology.devicesBelow(n.leafCount)}
              </text>
            ) : null}
          </g>
        );
      })}
      {tags.map((t) => (
        <PortTagLabel key={t.key} tag={t} />
      ))}
    </svg>
  );
}

const MAINT_CHAR_PX = 7.2;

/** A tab on the box's top edge, right-aligned: gear in maintenance reads from across the diagram. */
function MaintTab({ x, y, text }: { x: number; y: number; text: string }) {
  const w = text.length * MAINT_CHAR_PX + 26;
  return (
    <g className="topo-node__maint" aria-hidden="true">
      <rect x={x - w - 8} y={y - 10} width={w} height={20} rx={10} />
      <StateGlyph state="maintenance" cx={x - w + 4} cy={y} />
      <text x={x - w + 14} y={y + 4.5}>
        {text}
      </text>
    </g>
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
