import polygonClipping from 'polygon-clipping';

export type Point = [number, number];
export type Ring = Point[];
export type Poly = Ring[];
export type MultiPoly = Poly[];
type Shape = Poly | MultiPoly;

/** Areas at or below this (m²) count as zero, so touching edges never count as overlap. */
export const EPS_AREA = 1e-6;
const EPS_LEN = 1e-9;

export interface Placement {
  x: number;
  y: number;
  w: number;
  d: number;
  angle: number;
}

const toRad = (deg: number): number => (deg * Math.PI) / 180;

export function rotatedBoundsSize(w: number, d: number, angle: number): { w: number; d: number } {
  const a = toRad(angle);
  const c = Math.abs(Math.cos(a));
  const s = Math.abs(Math.sin(a));
  return { w: w * c + d * s, d: w * s + d * c };
}

export function centerOf(p: Placement): Point {
  const b = rotatedBoundsSize(p.w, p.d, p.angle);
  return [p.x + b.w / 2, p.y + b.d / 2];
}

export function topLeftForCenter(center: Point, w: number, d: number, angle: number): Point {
  const b = rotatedBoundsSize(w, d, angle);
  return [center[0] - b.w / 2, center[1] - b.d / 2];
}

/** Local coordinates are relative to the centre; +y is the object's Front (down the plan at 0°). */
export function localToWorld(p: Placement, local: Point): Point {
  const [cx, cy] = centerOf(p);
  const a = toRad(p.angle);
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [cx + local[0] * c - local[1] * s, cy + local[0] * s + local[1] * c];
}

export function worldToLocal(p: Placement, world: Point): Point {
  const [cx, cy] = centerOf(p);
  const a = toRad(p.angle);
  const c = Math.cos(a);
  const s = Math.sin(a);
  const dx = world[0] - cx;
  const dy = world[1] - cy;
  return [dx * c + dy * s, -dx * s + dy * c];
}

export function localRectPolygon(p: Placement, x0: number, y0: number, x1: number, y1: number): Poly {
  const local: Point[] = [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ];
  const corners = local.map((pt) => localToWorld(p, pt));
  return [[...corners, corners[0] as Point]];
}

export const placementPolygon = (p: Placement): Poly =>
  localRectPolygon(p, -p.w / 2, -p.d / 2, p.w / 2, p.d / 2);

export const rectPolygon = (x: number, y: number, w: number, d: number): Poly => [
  [
    [x, y],
    [x + w, y],
    [x + w, y + d],
    [x, y + d],
    [x, y],
  ],
];

export function placementWithin(p: Placement, width: number, length: number): boolean {
  const b = rotatedBoundsSize(p.w, p.d, p.angle);
  return p.x >= -EPS_LEN && p.y >= -EPS_LEN && p.x + b.w <= width + EPS_LEN && p.y + b.d <= length + EPS_LEN;
}

function ringArea(ring: Ring): number {
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i += 1) {
    const a = ring[i] as Point;
    const b = ring[i + 1] as Point;
    sum += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(sum) / 2;
}

export function area(shape: MultiPoly): number {
  return shape.reduce((total, poly) => {
    const [outer, ...holes] = poly;
    if (!outer) return total;
    return total + ringArea(outer) - holes.reduce((h, ring) => h + ringArea(ring), 0);
  }, 0);
}

export function union(polys: Poly[]): MultiPoly {
  const [first, ...rest] = polys;
  if (!first) return [];
  return polygonClipping.union(first, ...rest);
}

const isEmpty = (s: Shape): boolean => s.length === 0;

export function intersection(a: Shape, b: Shape): MultiPoly {
  if (isEmpty(a) || isEmpty(b)) return [];
  return polygonClipping.intersection(a, b);
}

export function difference(a: Shape, b: Shape): MultiPoly {
  if (isEmpty(a)) return [];
  if (isEmpty(b)) return polygonClipping.union(a);
  return polygonClipping.difference(a, b);
}

export const overlaps = (a: Poly, b: Poly): boolean => area(intersection(a, b)) > EPS_AREA;

export const containedIn = (shape: Poly, region: MultiPoly): boolean =>
  region.length > 0 && area(difference(shape, region)) <= EPS_AREA;

function inRing([px, py]: Point, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i] as Point;
    const [xj, yj] = ring[j] as Point;
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function pointInPolygon(point: Point, poly: Poly): boolean {
  const [outer, ...holes] = poly;
  if (!outer || !inRing(point, outer)) return false;
  return !holes.some((hole) => inRing(point, hole));
}
