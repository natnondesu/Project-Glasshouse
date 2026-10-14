import { footprintOf, placementPolygon, pointInPolygon, racksOf, type PlanContent, type Poly, type RoomObject } from '@glasshouse/domain';
import { ClearanceLayer, DimensionsLayer, FootprintLayer, HatchDefs, ObjectsLayer } from '../plan/layers';
import { wallGaps, type WallGap } from '../plan/measure';
import { DimensionLayer } from '../plan/DimensionLayer';
import { fit, toScreen, type View } from '../../viewport/math';
import '../plan/plan.css';

const SIZE = { width: 700, height: 760 };
const NO_FLAGS = new Set<string>();
const noop = (): void => undefined;

const SAMPLE_STEP_M = 0.05;

/** A dimension drawn through another object is unreadable on paper, and can't be measured on site either. */
function crossesObstacle(gap: WallGap, obstacles: Poly[]): boolean {
  const steps = Math.max(1, Math.ceil(gap.distance / SAMPLE_STEP_M));
  for (let i = 1; i < steps; i += 1) {
    const t = i / steps;
    const p: [number, number] = [gap.from[0] + (gap.to[0] - gap.from[0]) * t, gap.from[1] + (gap.to[1] - gap.from[1]) * t];
    if (obstacles.some((poly) => pointInPolygon(p, poly))) return true;
  }
  return false;
}

/** The nearest clear horizontal and vertical wall gap: enough to set a Rack out on the floor. */
function keyGaps(gaps: WallGap[], obstacles: Poly[]): WallGap[] {
  const nearest = (sides: WallGap['side'][]) =>
    gaps.filter((g) => sides.includes(g.side) && !crossesObstacle(g, obstacles)).sort((a, b) => a.distance - b.distance)[0];
  return [nearest(['left', 'right']), nearest(['top', 'bottom'])].filter((g): g is WallGap => g !== undefined);
}

function GapDimension({ gap, view }: { gap: WallGap; view: View }) {
  const [x1, y1] = toScreen(view, gap.from);
  const [x2, y2] = toScreen(view, gap.to);
  const horizontal = gap.side === 'left' || gap.side === 'right';
  return (
    <g className="sheet-gap">
      <line x1={x1} y1={y1} x2={x2} y2={y2} />
      <text x={(x1 + x2) / 2 + (horizontal ? 0 : 4)} y={(y1 + y2) / 2 + (horizontal ? -4 : 0)} textAnchor={horizontal ? 'middle' : 'start'} dominantBaseline={horizontal ? 'auto' : 'middle'}>
        {gap.distance.toFixed(2)}
      </text>
    </g>
  );
}

export function SheetPlan({ content, roomName }: { content: PlanContent; roomName: string }) {
  const view = fit({ w: content.survey.width, d: content.survey.length }, SIZE, 56);
  const footprint = footprintOf(content.survey);
  const others = (self: RoomObject): Poly[] => content.objects.filter((o) => o.id !== self.id).map(placementPolygon);
  const gaps = racksOf(content).flatMap((r) => keyGaps(wallGaps(r, footprint), others(r)));
  return (
    <svg className="sheet-plan plan-canvas" width={SIZE.width} height={SIZE.height} viewBox={`0 0 ${SIZE.width} ${SIZE.height}`} role="img" aria-label={`${roomName} plan`}>
      <HatchDefs />
      <FootprintLayer survey={content.survey} view={view} />
      <ClearanceLayer objects={content.objects} view={view} />
      <ObjectsLayer objects={content.objects} view={view} flagged={NO_FLAGS} selectedId={null} onFocusObject={noop} isStatic />
      <DimensionsLayer survey={content.survey} view={view} />
      <DimensionLayer content={content} view={view} isStatic />
      {gaps.map((g, i) => (
        <GapDimension key={i} gap={g} view={view} />
      ))}
    </svg>
  );
}
