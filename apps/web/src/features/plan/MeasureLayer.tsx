import { footprintOf, formatMetres, type PlanContent, type Point } from '@glasshouse/domain';
import { useMemo } from 'react';
import { toScreen, type View } from '../../viewport/math';
import { measureBetween, wallGaps } from './measure';
import type { MeasureState } from './usePlanGestures';

const PILL_H = 22;

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
  const footprint = useMemo(() => footprintOf(content.survey), [content.survey]);
  const hovered = content.objects.find((o) => o.id === measure.hoverId) ?? null;
  const end = measure.b ?? measure.cursor;
  return (
    <g aria-live="polite">
      {hovered && measure.a === null
        ? wallGaps(hovered, footprint)
            .filter((g) => g.distance > 0.005)
            .map((g) => {
              const mid: Point = [(g.from[0] + g.to[0]) / 2, (g.from[1] + g.to[1]) / 2];
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
                {measure.cursor.label}
              </text>
            </g>
          );
        })()
      ) : null}
    </g>
  );
}
