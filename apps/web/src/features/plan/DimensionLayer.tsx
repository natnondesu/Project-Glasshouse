import { dimensionPoints, footprintOf, formatMetres, type Dimension, type DimensionAnchor, type PlanContent, type Point } from '@glasshouse/domain';
import { toScreen, type View } from '../../viewport/math';
import { useT, type Messages } from '../../i18n';

const TICK_PX = 5;
const ON_WALL_M = 1e-4;
/** Wider invisible stroke so a 1 px line is still easy to click. */
const HIT_STROKE_PX = 12;

function onWall(content: PlanContent, [x, y]: Point): boolean {
  return footprintOf(content.survey).some((poly) =>
    poly.some((ring) =>
      ring.slice(0, -1).some(([ax, ay], i) => {
        const [bx, by] = ring[i + 1]!;
        const len = Math.hypot(bx - ax, by - ay);
        if (len === 0) return false;
        const t = ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / (len * len);
        if (t < -ON_WALL_M || t > 1 + ON_WALL_M) return false;
        return Math.abs((bx - ax) * (ay - y) - (ax - x) * (by - ay)) / len < ON_WALL_M;
      }),
    ),
  );
}

export function describeAnchor(m: Messages, content: PlanContent, anchor: DimensionAnchor): string {
  if (anchor.kind === 'object') return content.objects.find((o) => o.id === anchor.objectId)?.name ?? m.dimension.removedObject;
  return onWall(content, [anchor.x, anchor.y]) ? m.dimension.wall : m.dimension.point;
}

function dimensionLabel(m: Messages, content: PlanContent, dim: Dimension, length: number): string {
  return m.dimension.label(formatMetres(length), describeAnchor(m, content, dim.a), describeAnchor(m, content, dim.b));
}

interface DimensionLayerProps {
  content: PlanContent;
  view: View;
  selectedId?: string | null;
  onFocusDimension?: (id: string) => void;
  /** Print: a drawing, not a set of controls. */
  isStatic?: boolean;
}

/** Saved drafting dimensions: offset line, extension lines, 45° ticks and the length above the line. */
export function DimensionLayer({ content, view, selectedId = null, onFocusDimension, isStatic = false }: DimensionLayerProps) {
  const m = useT();
  return (
    <g className="pdims">
      {content.dimensions.map((dim) => {
        const pts = dimensionPoints(content, dim);
        if (!pts) return null;
        const [a, b] = pts;
        const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (length === 0) return null;
        const [nx, ny] = [-(b[1] - a[1]) / length, (b[0] - a[0]) / length];
        const shift = (p: Point): Point => [p[0] + nx * dim.offset, p[1] + ny * dim.offset];
        const [sa, sb, pa, pb] = [toScreen(view, a), toScreen(view, b), toScreen(view, shift(a)), toScreen(view, shift(b))];
        const ux = (pb[0] - pa[0]) / (Math.hypot(pb[0] - pa[0], pb[1] - pa[1]) || 1);
        const uy = (pb[1] - pa[1]) / (Math.hypot(pb[0] - pa[0], pb[1] - pa[1]) || 1);
        // 45° drafting tick: along the line rotated by 45°.
        const tx = (ux - uy) * Math.SQRT1_2 * TICK_PX;
        const ty = (uy + ux) * Math.SQRT1_2 * TICK_PX;
        const tick = ([x, y]: Point) => `M${x - tx} ${y - ty} L${x + tx} ${y + ty}`;
        let angle = (Math.atan2(pb[1] - pa[1], pb[0] - pa[0]) * 180) / Math.PI;
        if (angle > 90) angle -= 180;
        if (angle < -90) angle += 180;
        const mid: Point = [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2];
        const selected = dim.id === selectedId;
        const interactive = isStatic
          ? {}
          : { role: 'button', tabIndex: 0, 'aria-label': dimensionLabel(m, content, dim, length), 'aria-pressed': selected, onFocus: () => onFocusDimension?.(dim.id) };
        return (
          <g
            key={dim.id}
            className={`pdim${selected ? ' is-selected' : ''}${dim.id === 'draft' ? ' is-draft' : ''}`}
            {...(dim.id === 'draft' ? {} : { 'data-dimension-id': dim.id })}
            {...(dim.id === 'draft' ? {} : interactive)}
          >
            {dim.offset !== 0 ? <path className="pdim__ext" d={`M${sa[0]} ${sa[1]} L${pa[0]} ${pa[1]} M${sb[0]} ${sb[1]} L${pb[0]} ${pb[1]}`} /> : null}
            <path className="pdim__line" d={`M${pa[0]} ${pa[1]} L${pb[0]} ${pb[1]} ${tick(pa)} ${tick(pb)}`} />
            {isStatic ? null : <path className="pdim__hit" d={`M${pa[0]} ${pa[1]} L${pb[0]} ${pb[1]}`} strokeWidth={HIT_STROKE_PX} />}
            <text className="pdim__label" x={mid[0]} y={mid[1]} dy={-5} textAnchor="middle" transform={`rotate(${angle} ${mid[0]} ${mid[1]})`}>
              {formatMetres(length)}
            </text>
          </g>
        );
      })}
    </g>
  );
}
