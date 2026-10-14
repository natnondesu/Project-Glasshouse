import { formatMetres, placementPolygon, type Issue, type PlanContent, type Point, type RoomObject } from '@glasshouse/domain';
import { nearestGaps } from './gaps';
import { toScreen, type View } from '../../viewport/math';
import { CULPRIT_ONLY } from './flagged';

const CALLOUT_CHARS = 30;
const CALLOUT_MAX_LINES = 3;
const LINE_PX = 14;
const CHAR_PX = 6.7;
const LEADER_PX = 34;
const CALLOUT_GAP_PX = 12;
const SCALE_STEPS_M = [0.25, 0.5, 1, 2, 5, 10];
const SCALE_TARGET_PX = 72;

function wrap(text: string): string[] {
  const words = text.replace(/\.$/, '').split(' ');
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    if ((line + ' ' + w).trim().length > CALLOUT_CHARS && line) {
      lines.push(line);
      line = w;
    } else line = (line + ' ' + w).trim();
  }
  if (line) lines.push(line);
  if (lines.length <= CALLOUT_MAX_LINES) return lines;
  return [...lines.slice(0, CALLOUT_MAX_LINES - 1), `${lines.slice(CALLOUT_MAX_LINES - 1).join(' ').slice(0, CALLOUT_CHARS - 1)}…`];
}

/** One drafting callout per object that blocks approval: a leader from its corner to a short note, like a marked-up drawing. */
export function CalloutLayer({ issues, objects, view, maxX = Infinity }: { issues: Issue[]; objects: RoomObject[]; view: View; maxX?: number }) {
  const seen = new Set<string>();
  const callouts = issues.flatMap((issue) => {
    if (issue.severity !== 'block') return [];
    const targetId = (CULPRIT_ONLY.has(issue.code) ? issue.targets.slice(0, 1) : issue.targets).find((t) => objects.some((o) => o.id === t));
    if (!targetId || seen.has(targetId)) return [];
    seen.add(targetId);
    const o = objects.find((x) => x.id === targetId)!;
    const ring = placementPolygon(o)[0] ?? [];
    const pts = ring.map((p) => toScreen(view, p));
    const left = Math.min(...pts.map((p) => p[0]));
    const right = Math.max(...pts.map((p) => p[0]));
    const mid = (Math.min(...pts.map((p) => p[1])) + Math.max(...pts.map((p) => p[1]))) / 2;
    const lines = wrap(issue.message);
    const width = Math.max(...lines.map((l) => l.length), 8) * CHAR_PX;
    // Flip to the left when the note would run under the inspector.
    const flip = right + LEADER_PX + width > maxX;
    return [{ id: o.id, anchor: [flip ? left : right, mid] as const, lines, width, flip }];
  });
  // Nearby blocked objects would stack their notes on top of each other: push later ones down.
  const placed: { x0: number; x1: number; y0: number; y1: number }[] = [];
  return (
    <g aria-hidden="true" className="callouts">
      {callouts.map(({ id, anchor: [ax, ay], lines, width, flip }) => {
        const knee = flip ? ax - LEADER_PX : ax + LEADER_PX;
        const textX = flip ? knee - width + 4 : knee + 4;
        const height = 20 + lines.length * LINE_PX;
        let ly = ay - 26;
        const box = () => ({ x0: textX - 4, x1: textX + width, y0: ly - 20, y1: ly - 20 + height });
        while (placed.some((p) => { const b = box(); return b.x0 < p.x1 && b.x1 > p.x0 && b.y0 < p.y1 && b.y1 > p.y0; })) ly += CALLOUT_GAP_PX;
        placed.push(box());
        return (
          <g key={id}>
            <circle className="callout__dot" cx={ax} cy={ay} r={2.5} />
            <path className="callout__leader" d={`M${ax} ${ay} L${knee} ${ly} H${flip ? knee - width : knee + width}`} />
            <text className="callout__title" x={textX} y={ly - 6}>
              BLOCKING
            </text>
            {lines.map((l, i) => (
              <text key={i} className="callout__text" x={textX} y={ly + 13 + i * LINE_PX}>
                {l}
              </text>
            ))}
          </g>
        );
      })}
    </g>
  );
}

/** Scale bar picks a round length close to SCALE_TARGET_PX at the current zoom. */
export function scaleBar(view: View): { metres: number; px: number } {
  const metres = SCALE_STEPS_M.reduce((best, m) => (Math.abs(m * view.scale - SCALE_TARGET_PX) < Math.abs(best * view.scale - SCALE_TARGET_PX) ? m : best), 1);
  return { metres, px: metres * view.scale };
}

export function PlanLegend({ view }: { view: View }) {
  const bar = scaleBar(view);
  return (
    <div className="plan-legend" aria-label="Drawing legend">
      <span className="plan-legend__item">
        <span className="plan-legend__scale" style={{ width: bar.px }} />
        {bar.metres < 1 ? `${bar.metres * 100} cm` : `${bar.metres} m`}
      </span>
      <span className="plan-legend__item">
        <span className="plan-legend__swatch plan-legend__swatch--clearance" />
        Clearance zone
      </span>
      <span className="plan-legend__item">
        <span className="plan-legend__swatch plan-legend__swatch--front" />
        Rack front
      </span>
      <span className="plan-legend__item">
        <span className="plan-legend__swatch plan-legend__swatch--block" />
        Blocks approval
      </span>
    </div>
  );
}

const MIN_GAP_M = 0.005;
const GAP_TICK_PX = 4;

/** Live clearances from the active object to whatever is nearest on each side. */
export function GapLayer({ object, content, view }: { object: RoomObject; content: PlanContent; view: View }) {
  const gaps = nearestGaps(object, content).filter((g) => g.distance >= MIN_GAP_M);
  return (
    <g aria-hidden="true" className="gaps">
      {gaps.map((g) => {
        const [x1, y1] = toScreen(view, g.from);
        const [x2, y2] = toScreen(view, g.to);
        const horizontal = g.side === 'left' || g.side === 'right';
        const tick = ([x, y]: Point) => (horizontal ? `M${x} ${y - GAP_TICK_PX} V${y + GAP_TICK_PX}` : `M${x - GAP_TICK_PX} ${y} H${x + GAP_TICK_PX}`);
        const mx = (x1 + x2) / 2;
        const my = (y1 + y2) / 2;
        return (
          <g key={g.side} data-testid={`clear-${g.side}`}>
            <path className="gap__line" d={`M${x1} ${y1} L${x2} ${y2} ${tick([x1, y1])} ${tick([x2, y2])}`} />
            <text className="gap__label" x={horizontal ? mx : mx + 6} y={horizontal ? my - 6 : my} textAnchor={horizontal ? 'middle' : 'start'} dominantBaseline={horizontal ? 'auto' : 'middle'}>
              {formatMetres(g.distance)}
            </text>
          </g>
        );
      })}
    </g>
  );
}
