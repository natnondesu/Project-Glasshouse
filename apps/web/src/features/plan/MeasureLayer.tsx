import { footprintOf, formatMetres, placementPolygon, pointInPolygon, type PlanContent, type Point, type Poly } from '@glasshouse/domain';
import { useMemo } from 'react';
import { toScreen, type View } from '../../viewport/math';
import { measureBetween, WALL_CORNER_LABEL, WALL_LABEL, wallGaps } from './measure';
import { useT } from '../../i18n';
import type { MeasureState } from './usePlanGestures';

const PILL_H = 22;
const PILL_HALF_W_PX = 30;
/** Preferred label positions along a gap, centre first; the first one clear of every object wins. */
const LABEL_STOPS = [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8, 0.12, 0.88];

function freeLabelSpot(from: Point, to: Point, obstacles: Poly[], halfW: number, halfH: number): Point {
  const at = (t: number): Point => [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t];
  const clear = ([x, y]: Point): boolean => {
    const probes: Point[] = [[x, y], [x - halfW, y - halfH], [x + halfW, y - halfH], [x - halfW, y + halfH], [x + halfW, y + halfH]];
    return !obstacles.some((poly) => probes.some((pt) => pointInPolygon(pt, poly)));
  };
  return LABEL_STOPS.map(at).find(clear) ?? at(0.5);
}

function Pill({ at, text, sub, testId }: { at: Point; text: string; sub?: string; testId?: string }) {
  const width = Math.max(text.length, sub?.length ?? 0) * 7.4 + 18;
  const height = sub ? PILL_H + 15 : PILL_H;
  return (
    <g data-testid={testId} className="measure__pill" transform={`translate(${at[0] - width / 2} ${at[1] - height / 2})`}>
      <rect width={width} height={height} rx={height / 2 > 11 ? 10 : height / 2} />
      <text x={width / 2} y={15} textAnchor="middle" className="measure__value">
        {text}
      </text>
      {sub ? (
        <text x={width / 2} y={30} textAnchor="middle" className="measure__sub">
          {sub}
        </text>
      ) : null}
    </g>
  );
}

function Segment({ a, b, view, live = false }: { a: Point; b: Point; view: View; live?: boolean }) {
  const [ax, ay] = toScreen(view, a);
  const [bx, by] = toScreen(view, b);
  return (
    <g className={live ? 'measure__line measure__line--live' : 'measure__line'}>
      <line x1={ax} y1={ay} x2={bx} y2={by} />
      <circle cx={ax} cy={ay} r={3.5} />
      <circle cx={bx} cy={by} r={3.5} />
    </g>
  );
}

export function MeasureLayer({ measure, content, view }: { measure: MeasureState; content: PlanContent; view: View }) {
  const m = useT();
  const footprint = useMemo(() => footprintOf(content.survey), [content.survey]);
  const hovered = content.objects.find((o) => o.id === measure.hoverId) ?? null;
  const obstacles = useMemo(() => content.objects.map((o) => placementPolygon(o)), [content.objects]);
  const end = measure.b ?? measure.cursor;
  return (
    <g aria-live="polite">
      {hovered && measure.a === null
        ? wallGaps(hovered, footprint)
            .filter((g) => g.distance > 0.005)
            .map((g) => {
              const mid = freeLabelSpot(g.from, g.to, obstacles, PILL_HALF_W_PX / view.scale, PILL_H / 2 / view.scale);
              return (
                <g key={g.side}>
                  <Segment a={g.from} b={g.to} view={view} />
                  <Pill at={toScreen(view, mid)} text={`${formatMetres(g.distance)} m`} testId={`gap-${g.side}`} />
                </g>
              );
            })
        : null}
      {measure.a && end ? (
        <>
          <Segment a={measure.a.point} b={end.point} view={view} live={measure.b === null} />
          {(() => {
            const m = measureBetween(measure.a.point, end.point);
            const mid = toScreen(view, [(measure.a.point[0] + end.point[0]) / 2, (measure.a.point[1] + end.point[1]) / 2]);
            return <Pill at={[mid[0], mid[1] - 22]} text={`${formatMetres(m.distance)} m`} sub={`ΔX ${formatMetres(m.dx)} · ΔY ${formatMetres(m.dy)}`} testId="measure-result" />;
          })()}
        </>
      ) : null}
      {measure.cursor && measure.cursor.kind !== 'free' && measure.b === null ? (
        (() => {
          const [cx, cy] = toScreen(view, measure.cursor.point);
          return (
            <g className="measure__snap">
              <circle cx={cx} cy={cy} r={6} />
              <text x={cx + 10} y={cy - 8}>
                {measure.cursor.label === WALL_LABEL ? m.plan.wall : measure.cursor.label === WALL_CORNER_LABEL ? m.plan.wallCorner : measure.cursor.label}
              </text>
            </g>
          );
        })()
      ) : null}
    </g>
  );
}
