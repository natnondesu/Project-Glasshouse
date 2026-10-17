import {
  placementPolygon,
  rotatedBoundsSize,
  snapTyped,
  footprintOf,
  type MultiPoly,
  type Placement,
  type PlanContent,
  type Point,
  type Ring,
} from '@glasshouse/domain';

/** Snap labels for walls; MeasureLayer swaps them for the active language. Objects use their own names. */
export const WALL_LABEL = 'Wall';
export const WALL_CORNER_LABEL = 'Wall corner';

export interface SnapTarget {
  point: Point;
  kind: 'corner' | 'edge' | 'free';
  /** What the point snapped to, shown next to the cursor ("Wall", "RK-01"); null when free. */
  label: string | null;
  /** The object the point lies on, so a saved dimension can follow it; null for walls and free points. */
  objectId: string | null;
}

interface Measurement {
  distance: number;
  dx: number;
  dy: number;
}

export type GapSide = 'left' | 'right' | 'top' | 'bottom';

export interface WallGap {
  side: GapSide;
  from: Point;
  to: Point;
  distance: number;
}

interface Feature {
  ring: Ring;
  label: string;
  cornerLabel: string;
  objectId: string | null;
}

const EPS = 1e-9;

export function measureBetween(a: Point, b: Point): Measurement {
  const dx = Math.abs(b[0] - a[0]);
  const dy = Math.abs(b[1] - a[1]);
  return { distance: Math.hypot(dx, dy), dx, dy };
}

function closestOnSegment(p: Point, a: Point, b: Point): Point {
  const vx = b[0] - a[0];
  const vy = b[1] - a[1];
  const len2 = vx * vx + vy * vy;
  if (len2 < EPS) return a;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / len2));
  return [a[0] + t * vx, a[1] + t * vy];
}

const dist = (a: Point, b: Point): number => Math.hypot(a[0] - b[0], a[1] - b[1]);

function features(content: PlanContent): Feature[] {
  const walls = footprintOf(content.survey).flatMap((poly) => poly.map((ring) => ({ ring, label: WALL_LABEL, cornerLabel: WALL_CORNER_LABEL, objectId: null })));
  const objects = content.objects.flatMap((o) => placementPolygon(o).map((ring) => ({ ring, label: o.name, cornerLabel: o.name, objectId: o.id })));
  return [...walls, ...objects];
}

/** Corners win over edges so a click near a corner lands exactly on it. `tolerance` is in metres. */
export function snapMeasurePoint(p: Point, content: PlanContent, tolerance: number): SnapTarget {
  const all = features(content);
  let best: SnapTarget | null = null;
  let bestDist = tolerance;
  for (const f of all) {
    for (const corner of f.ring) {
      const d = dist(p, corner);
      if (d <= bestDist) {
        bestDist = d;
        best = { point: corner, kind: 'corner', label: f.cornerLabel, objectId: f.objectId };
      }
    }
  }
  if (best) return best;
  bestDist = tolerance;
  for (const f of all) {
    for (let i = 0; i < f.ring.length - 1; i += 1) {
      const onEdge = closestOnSegment(p, f.ring[i] as Point, f.ring[i + 1] as Point);
      const d = dist(p, onEdge);
      if (d <= bestDist) {
        bestDist = d;
        best = { point: onEdge, kind: 'edge', label: f.label, objectId: f.objectId };
      }
    }
  }
  return best ?? { point: [snapTyped(p[0]), snapTyped(p[1])], kind: 'free', label: null, objectId: null };
}

/** Distance along an axis-aligned ray from `origin` to the first footprint boundary (walls and cut-outs). */
function rayToWall(origin: Point, dir: Point, footprint: MultiPoly): number | null {
  let nearest: number | null = null;
  for (const poly of footprint) {
    for (const ring of poly) {
      for (let i = 0; i < ring.length - 1; i += 1) {
        const [ax, ay] = ring[i] as Point;
        const [bx, by] = ring[i + 1] as Point;
        let t: number | null = null;
        if (dir[0] !== 0) {
          if ((ay - origin[1]) * (by - origin[1]) > EPS || Math.abs(bx - ax) > EPS || Math.abs(ay - by) < EPS) continue;
          t = (ax - origin[0]) / dir[0];
        } else {
          if ((ax - origin[0]) * (bx - origin[0]) > EPS || Math.abs(by - ay) > EPS || Math.abs(ax - bx) < EPS) continue;
          t = (ay - origin[1]) / dir[1];
        }
        if (t > -EPS && (nearest === null || t < nearest)) nearest = Math.max(0, t);
      }
    }
  }
  return nearest;
}

/** Gaps from an object's bounding box to the nearest wall on each side, measured through its centre lines. */
export function wallGaps(o: Placement, footprint: MultiPoly): WallGap[] {
  const b = rotatedBoundsSize(o.w, o.d, o.angle);
  const x0 = o.x;
  const x1 = o.x + b.w;
  const y0 = o.y;
  const y1 = o.y + b.d;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const rays: { side: GapSide; from: Point; dir: Point }[] = [
    { side: 'left', from: [x0, cy], dir: [-1, 0] },
    { side: 'right', from: [x1, cy], dir: [1, 0] },
    { side: 'top', from: [cx, y0], dir: [0, -1] },
    { side: 'bottom', from: [cx, y1], dir: [0, 1] },
  ];
  return rays.flatMap(({ side, from, dir }) => {
    const distance = rayToWall(from, dir, footprint);
    if (distance === null) return [];
    const to: Point = [from[0] + dir[0] * distance, from[1] + dir[1] * distance];
    return [{ side, from, to, distance }];
  });
}
