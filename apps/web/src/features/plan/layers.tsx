import {
  centerOf,
  clearanceZones,
  footprintOf,
  formatMetres,
  frontEdge,
  localToWorld,
  placementPolygon,
  rotatedBoundsSize,
  type Point,
  type RoomObject,
  type Survey,
  usedU,
} from '@glasshouse/domain';
import { useMemo, type ReactElement } from 'react';
import { toScreen, type View } from '../../viewport/math';
import { TYPE_LABEL } from './labels';
import { polygonPath, multiPolygonPath } from './svgPath';
import { DoorSymbol, fitLabel, HoverTag, McbSymbol, SourceSymbol } from './symbols';

/** Too thin or too small for a name: these rely on their symbol and the hover tag. */
const UNLABELLED = new Set<string>(['door', 'mcb', 'wall_plug', 'industrial_socket', 'floor_box']);

const GRID_STEP_M = 0.5;
const MIN_LABEL_PX = 34;
const DIM_OFFSET_PX = 28;

export type Preview =
  | { kind: 'object'; id: string; patch: { x: number; y: number; w?: number; d?: number } }
  | { kind: 'rect'; mode: 'area' | 'cut'; x: number; y: number; w: number; d: number }
  | { kind: 'dimension'; id: string; offset: number };

export function HatchDefs() {
  return (
    <defs>
      <filter id="gh-floor-shadow" x="-10%" y="-10%" width="120%" height="125%">
        <feOffset dy="6" />
        <feGaussianBlur stdDeviation="10" />
      </filter>
      <pattern id="gh-hatch-clearance" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="7" height="7" className="hatch-fill" />
        <path d="M0 0V7" className="hatch-line hatch-line--clearance" />
      </pattern>
      <pattern id="gh-hatch-cut" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
        <path d="M0 0V6" className="hatch-line" />
      </pattern>
    </defs>
  );
}

export function GridLayer({ survey, view }: { survey: Survey; view: View }) {
  const lines: ReactElement[] = [];
  const cols = Math.floor(survey.width / GRID_STEP_M + 1e-9);
  const rows = Math.floor(survey.length / GRID_STEP_M + 1e-9);
  const [x0, y0] = toScreen(view, [0, 0]);
  const [x1, y1] = toScreen(view, [survey.width, survey.length]);
  for (let i = 0; i <= cols; i += 1) {
    const [sx] = toScreen(view, [i * GRID_STEP_M, 0]);
    lines.push(<line key={`v${i}`} x1={sx} y1={y0} x2={sx} y2={y1} className={i % 2 === 0 ? 'grid grid--major' : 'grid'} />);
  }
  for (let j = 0; j <= rows; j += 1) {
    const [, sy] = toScreen(view, [0, j * GRID_STEP_M]);
    lines.push(<line key={`h${j}`} x1={x0} y1={sy} x2={x1} y2={sy} className={j % 2 === 0 ? 'grid grid--major' : 'grid'} />);
  }
  return (
    <g aria-hidden="true">
      {lines}
      <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} className="canvas-bounds" />
    </g>
  );
}

export function FootprintLayer({ survey, view }: { survey: Survey; view: View }) {
  const fp = useMemo(() => footprintOf(survey), [survey]);
  return (
    <g aria-hidden="true">
      <path className="footprint-shadow" d={multiPolygonPath(fp, view)} fillRule="evenodd" filter="url(#gh-floor-shadow)" />
      <path data-testid="footprint" className="footprint" d={multiPolygonPath(fp, view)} fillRule="evenodd" />
      {survey.cutOuts.map((r) => {
        const [x, y] = toScreen(view, [r.x, r.y]);
        const w = r.w * view.scale;
        const h = r.d * view.scale;
        return (
          <g key={r.id}>
            <rect className="cut-out" x={x} y={y} width={w} height={h} />
            <path className="cut-out__cross" d={`M${x} ${y} L${x + w} ${y + h} M${x + w} ${y} L${x} ${y + h}`} />
          </g>
        );
      })}
    </g>
  );
}

export function ClearanceLayer({ objects, view }: { objects: RoomObject[]; view: View }) {
  return (
    <g aria-hidden="true">
      {objects.flatMap((o) => {
        if (o.type !== 'rack') return [];
        const zones = clearanceZones(o);
        return (['front', 'rear'] as const).flatMap((side) => {
          const zone = zones[side];
          return zone ? [<path key={`${o.id}-${side}`} className="clearance" d={polygonPath(zone, view)} />] : [];
        });
      })}
    </g>
  );
}

function RackFront({ rack, view }: { rack: RoomObject; view: View }) {
  const [a, b] = frontEdge(rack).map((p) => toScreen(view, p)) as [Point, Point];
  const ex = b[0] - a[0];
  const ey = b[1] - a[1];
  const len = Math.hypot(ex, ey) || 1;
  const [ux, uy] = [ex / len, ey / len];
  const [nx, ny] = [-uy, ux];
  const mid: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const tip: Point = [mid[0] + nx * 8, mid[1] + ny * 8];
  const left: Point = [mid[0] + ux * 5 + nx * 2, mid[1] + uy * 5 + ny * 2];
  const right: Point = [mid[0] - ux * 5 + nx * 2, mid[1] - uy * 5 + ny * 2];
  return (
    <g aria-hidden="true">
      <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} className="rack-front" />
      <path d={`M${left[0]} ${left[1]} L${tip[0]} ${tip[1]} L${right[0]} ${right[1]} Z`} className="rack-front-arrow" />
    </g>
  );
}

function crossPath(o: RoomObject, view: View): string {
  const [ring] = placementPolygon(o);
  if (!ring) return '';
  const [p0, p1, p2, p3] = ring.map((p) => toScreen(view, p));
  if (!p0 || !p1 || !p2 || !p3) return '';
  return `M${p0[0]} ${p0[1]} L${p2[0]} ${p2[1]} M${p1[0]} ${p1[1]} L${p3[0]} ${p3[1]}`;
}

interface ObjectsLayerProps {
  objects: RoomObject[];
  view: View;
  flagged: Set<string>;
  selectedId: string | null;
  onFocusObject: (id: string) => void;
  /** Print: a drawing, not a set of controls. */
  isStatic?: boolean;
}

export function ObjectsLayer({ objects, view, flagged, selectedId, onFocusObject, isStatic = false }: ObjectsLayerProps) {
  return (
    <g>
      {objects.map((o) => {
        const [cx, cy] = toScreen(view, centerOf(o));
        const bounds = rotatedBoundsSize(o.w, o.d, o.angle);
        const tall = bounds.d * view.scale;
        // Labels must fit inside the object; doors and MCB panels are too thin and rely on the hover tag.
        const labelled = !UNLABELLED.has(o.type) && tall >= MIN_LABEL_PX * (o.type === 'rack' ? 1 : 0.6);
        const label = labelled ? fitLabel(o.name, bounds.w * view.scale) : null;
        const sub = label && o.type === 'rack' && tall >= MIN_LABEL_PX * 1.4 ? fitLabel(o.owner === 'customer' ? 'CUST' : `${usedU(o)}/${o.capacityU}U`, bounds.w * view.scale, 6.7) : null;
        const topY = toScreen(view, [0, o.y])[1];
        const classes = ['obj', `obj--${o.type}`, o.type === 'rack' && o.owner === 'customer' ? 'obj--customer' : '', flagged.has(o.id) ? 'is-flagged' : '', o.id === selectedId ? 'is-selected' : '']
          .filter(Boolean)
          .join(' ');
        return (
          <g
            key={o.id}
            className={classes}
            data-object-id={o.id}
            {...(isStatic
              ? {}
              : { role: 'button', tabIndex: 0, 'aria-label': `${o.name}, ${TYPE_LABEL[o.type]}`, 'aria-pressed': o.id === selectedId, onFocus: () => onFocusObject(o.id) })}
          >
            <path className="obj__body" d={polygonPath(placementPolygon(o), view)} />
            {o.type === 'existing_rack' ? <path className="obj__cross" d={crossPath(o, view)} /> : null}
            {o.type === 'door' ? <DoorSymbol o={o} view={view} /> : null}
            {o.type === 'mcb' ? <McbSymbol o={o} view={view} /> : null}
            <SourceSymbol o={o} view={view} />
            {o.type === 'rack' ? <RackFront rack={o} view={view} /> : null}
            {label ? (
              <text className="obj__label" x={cx} y={sub ? cy - 7 : cy} textAnchor="middle" dominantBaseline="middle">
                {label}
              </text>
            ) : null}
            {sub ? (
              <text className="obj__sub" x={cx} y={cy + 9} textAnchor="middle" dominantBaseline="middle">
                {sub}
              </text>
            ) : null}
            {isStatic ? null : <HoverTag name={o.name} x={cx} y={topY} />}
          </g>
        );
      })}
    </g>
  );
}

const HANDLE_POSITIONS = [
  ['nw', -1, -1],
  ['n', 0, -1],
  ['ne', 1, -1],
  ['e', 1, 0],
  ['se', 1, 1],
  ['s', 0, 1],
  ['sw', -1, 1],
  ['w', -1, 0],
] as const;

export function SelectionLayer({ object, view }: { object: RoomObject; view: View }) {
  return (
    <g>
      <path className="selection" d={polygonPath(placementPolygon(object), view)} />
      {HANDLE_POSITIONS.map(([handle, fx, fy]) => {
        const [sx, sy] = toScreen(view, localToWorld(object, [(fx * object.w) / 2, (fy * object.d) / 2]));
        return <circle key={handle} data-handle={handle} className={`handle handle--${handle}`} cx={sx} cy={sy} r={5} />;
      })}
    </g>
  );
}

export function DimensionsLayer({ survey, view }: { survey: Survey; view: View }) {
  const [x0, y0] = toScreen(view, [0, 0]);
  const [x1, y1] = toScreen(view, [survey.width, survey.length]);
  const top = y0 - DIM_OFFSET_PX;
  const left = x0 - DIM_OFFSET_PX;
  const tick = (x: number, y: number) => `M${x - 4} ${y + 4} L${x + 4} ${y - 4}`;
  const midX = (x0 + x1) / 2;
  const midY = (y0 + y1) / 2;
  return (
    <g aria-hidden="true">
      <path className="dim__ext" d={`M${x0} ${y0 - 4} V${top - 6} M${x1} ${y0 - 4} V${top - 6}`} />
      <path className="dim" d={`M${x0} ${top} H${x1} ${tick(x0, top)} ${tick(x1, top)}`} />
      <rect className="dim__bg" x={midX - 24} y={top - 9} width={48} height={18} />
      <text className="dim__label" x={midX} y={top} textAnchor="middle" dominantBaseline="middle">
        {formatMetres(survey.width)}
      </text>
      <path className="dim__ext" d={`M${x0 - 4} ${y0} H${left - 6} M${x0 - 4} ${y1} H${left - 6}`} />
      <path className="dim" d={`M${left} ${y0} V${y1} ${tick(left, y0)} ${tick(left, y1)}`} />
      <rect className="dim__bg" x={left - 9} y={midY - 24} width={18} height={48} />
      <text className="dim__label" x={left} y={midY} textAnchor="middle" dominantBaseline="middle" transform={`rotate(-90 ${left} ${midY})`}>
        {formatMetres(survey.length)}
      </text>
    </g>
  );
}

export function FloorPreview({ preview, view }: { preview: Extract<Preview, { kind: 'rect' }>; view: View }) {
  const [x, y] = toScreen(view, [preview.x, preview.y]);
  return (
    <g aria-hidden="true">
      <rect className={`preview preview--${preview.mode}`} x={x} y={y} width={preview.w * view.scale} height={preview.d * view.scale} />
      <text className="dim__label" x={x + (preview.w * view.scale) / 2} y={y - 10} textAnchor="middle">
        {`${formatMetres(preview.w)} × ${formatMetres(preview.d)}`}
      </text>
    </g>
  );
}
