import { footprintOf } from './footprint';
import { rotatedBoundsSize, type Point, type Ring } from './geometry/polygon';
import type { Survey } from './model/types';

export interface OnRing {
  point: Point;
  edge: number;
  /** Distance along the ring from its first vertex. */
  s: number;
}

export function closestOnRing(ring: Ring, p: Point): OnRing & { distance: number } {
  let best: OnRing & { distance: number } = { point: ring[0]!, edge: 0, s: 0, distance: Infinity };
  let s0 = 0;
  for (let i = 0; i < ring.length - 1; i += 1) {
    const a = ring[i]!;
    const b = ring[i + 1]!;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) / (len * len)));
    const q: Point = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
    const d = Math.hypot(p[0] - q[0], p[1] - q[1]);
    if (d < best.distance) best = { point: q, edge: i, s: s0 + t * len, distance: d };
    s0 += len;
  }
  return best;
}

const signedArea = (ring: Ring): number => ring.slice(0, -1).reduce((sum, [x1, y1], i) => sum + x1 * ring[i + 1]![1] - ring[i + 1]![0] * y1, 0) / 2;

/** Unit normal of edge i pointing into the room. */
export function inward(ring: Ring, i: number): Point {
  const n = ring.length - 1;
  const a = ring[((i % n) + n) % n]!;
  const b = ring[((i % n) + n) % n + 1]!;
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const left: Point = [-(b[1] - a[1]) / len, (b[0] - a[0]) / len];
  return signedArea(ring) > 0 ? left : [-left[0], -left[1]];
}

/** Offsets a ring vertex into the room, mitred so both walls stay `k` away. */
export function insetVertex(ring: Ring, i: number, k: number): Point {
  const n1 = inward(ring, i - 1);
  const n2 = inward(ring, i);
  const mx = n1[0] + n2[0];
  const my = n1[1] + n2[1];
  const dot = 1 + n1[0] * n2[0] + n1[1] * n2[1];
  const v = ring[i]!;
  return dot < 1e-6 ? [v[0] + n2[0] * k, v[1] + n2[1] * k] : [v[0] + (mx * k) / dot, v[1] + (my * k) / dot];
}


/**
 * Where a wall-mounted object goes for a cursor near a wall: back against the nearest straight
 * wall, front facing into the room. Null when there is no floor yet.
 */
export function snapToWall(survey: Survey, cursor: Point, w: number, d: number): { x: number; y: number; angle: number } | null {
  const rings = footprintOf(survey).flatMap((poly) => poly).filter((r) => r.length > 3);
  if (rings.length === 0) return null;
  const best = rings.map((ring) => ({ ring, at: closestOnRing(ring, cursor) })).sort((a, b) => a.at.distance - b.at.distance)[0]!;
  const [nx, ny] = inward(best.ring, best.at.edge);
  const [px, py] = best.at.point;
  // Front (local +y) faces along the inward normal.
  const angle = Math.abs(ny) >= Math.abs(nx) ? (ny > 0 ? 0 : 180) : nx > 0 ? 270 : 90;
  const b = rotatedBoundsSize(w, d, angle);
  if (angle === 0 || angle === 180) return { x: px - b.w / 2, y: ny > 0 ? py : py - b.d, angle };
  return { x: nx > 0 ? px : px - b.w, y: py - b.d / 2, angle };
}
