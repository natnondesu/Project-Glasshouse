import { footprintOf, placementPolygon, rotatedBoundsSize, type Placement, type PlanContent, type Point, type RoomObject } from '@glasshouse/domain';
import type { GapSide } from './measure';

export interface Gap {
  side: GapSide;
  from: Point;
  to: Point;
  distance: number;
  /** "Wall" or the name of the object the gap ends at. */
  target: string;
}

/** Rays cast across each side, so a neighbour beside the centre line still counts. */
const RAYS_PER_SIDE = 7;
const EPS = 1e-9;

interface Segment {
  a: Point;
  b: Point;
  label: string;
}

/** Ray–segment intersection; returns the ray parameter t ≥ 0 or null. */
function hit(origin: Point, dir: Point, s: Segment): number | null {
  const ex = s.b[0] - s.a[0];
  const ey = s.b[1] - s.a[1];
  const den = dir[0] * ey - dir[1] * ex;
  if (Math.abs(den) < EPS) return null;
  const qx = s.a[0] - origin[0];
  const qy = s.a[1] - origin[1];
  const t = (qx * ey - qy * ex) / den;
  const u = (qx * dir[1] - qy * dir[0]) / den;
  return t >= -EPS && u >= -EPS && u <= 1 + EPS ? Math.max(0, t) : null;
}

function segments(content: PlanContent, selfId: string | null): Segment[] {
  const rings: { ring: Point[]; label: string }[] = [
    ...footprintOf(content.survey).flatMap((poly) => poly.map((ring) => ({ ring, label: 'Wall' }))),
    ...content.objects.filter((o) => o.id !== selfId).flatMap((o: RoomObject) => placementPolygon(o).map((ring) => ({ ring, label: o.name }))),
  ];
  return rings.flatMap(({ ring, label }) => ring.slice(0, -1).map((a, i) => ({ a, b: ring[i + 1] as Point, label })));
}

/**
 * The clear distance from each side of an object's bounding box to the nearest wall or object,
 * shown while placing, dragging and when selected so the planner can see what to adjust.
 */
export function nearestGaps(o: Placement & { id?: string }, content: PlanContent): Gap[] {
  const b = rotatedBoundsSize(o.w, o.d, o.angle);
  const x0 = o.x;
  const x1 = o.x + b.w;
  const y0 = o.y;
  const y1 = o.y + b.d;
  const segs = segments(content, o.id ?? null);
  const along = (lo: number, hi: number): number[] => Array.from({ length: RAYS_PER_SIDE }, (_, i) => lo + ((hi - lo) * (i + 0.5)) / RAYS_PER_SIDE);
  const sides: { side: GapSide; dir: Point; origins: Point[] }[] = [
    { side: 'left', dir: [-1, 0], origins: along(y0, y1).map((y) => [x0, y]) },
    { side: 'right', dir: [1, 0], origins: along(y0, y1).map((y) => [x1, y]) },
    { side: 'top', dir: [0, -1], origins: along(x0, x1).map((x) => [x, y0]) },
    { side: 'bottom', dir: [0, 1], origins: along(x0, x1).map((x) => [x, y1]) },
  ];
  return sides.flatMap(({ side, dir, origins }) => {
    let best: Gap | null = null;
    for (const from of origins) {
      for (const s of segs) {
        const t = hit(from, dir, s);
        if (t === null || (best && t >= best.distance)) continue;
        best = { side, from, to: [from[0] + dir[0] * t, from[1] + dir[1] * t], distance: t, target: s.label };
      }
    }
    return best ? [best] : [];
  });
}
