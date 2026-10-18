import { footprintOf } from './footprint';
import { placementPolygon, rotatedBoundsSize, topLeftForCenter, worldToLocal, type Point, type Ring } from './geometry/polygon';
import type { PlanContent, RoomObject, Survey } from './model/types';
import { isPartition, partitionFaces, snapDoorToPartition } from './partitions';
import { normalizeAngle, snapTyped } from './units';

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


export interface WallSnap {
  x: number;
  y: number;
  angle: number;
  /** Set when the object hangs on a partition rather than a wall of the room. */
  partitionId?: string;
}

/** Back against the face of the partition on the cursor's side, front towards that side; null when there is none. */
function snapToPartitionFace(partitions: readonly RoomObject[], cursor: Point, w: number, d: number): (WallSnap & { distance: number }) | null {
  let best: (WallSnap & { distance: number }) | null = null;
  for (const p of partitions.filter(isPartition)) {
    const [u, v] = worldToLocal(p, cursor);
    const face = partitionFaces(p)[v >= 0 ? 0 : 1];
    const slack = Math.max(0, (p.w - w) / 2);
    const t = (Math.min(Math.max(u, -slack), slack) + p.w / 2) / p.w;
    const contact: Point = [face.from[0] + (face.to[0] - face.from[0]) * t, face.from[1] + (face.to[1] - face.from[1]) * t];
    // The nearest point on the whole face, to compare with room walls.
    const tCursor = Math.min(Math.max((u + p.w / 2) / p.w, 0), 1);
    const nearest: Point = [face.from[0] + (face.to[0] - face.from[0]) * tCursor, face.from[1] + (face.to[1] - face.from[1]) * tCursor];
    const distance = Math.hypot(cursor[0] - nearest[0], cursor[1] - nearest[1]);
    if (best && best.distance <= distance) continue;
    const [nx, ny] = face.normal;
    const angle = normalizeAngle((Math.atan2(-nx, ny) * 180) / Math.PI);
    const [x, y] = topLeftForCenter([contact[0] + (nx * d) / 2, contact[1] + (ny * d) / 2], w, d, angle);
    best = { x: snapTyped(x), y: snapTyped(y), angle, partitionId: p.id, distance };
  }
  return best;
}

/**
 * Where a wall-mounted object goes for a cursor near a wall: back against the nearest straight
 * wall, front facing into the room. Partitions count as walls, on whichever side the cursor is. Null when there is no floor yet.
 */
export function snapToWall(survey: Survey, cursor: Point, w: number, d: number, partitions: readonly RoomObject[] = []): WallSnap | null {
  const rings = footprintOf(survey).flatMap((poly) => poly).filter((r) => r.length > 3);
  if (rings.length === 0) return null;
  const best = rings.map((ring) => ({ ring, at: closestOnRing(ring, cursor) })).sort((a, b) => a.at.distance - b.at.distance)[0]!;
  const onPartition = snapToPartitionFace(partitions, cursor, w, d);
  if (onPartition && onPartition.distance < best.at.distance) {
    const { distance: _distance, ...snap } = onPartition;
    return snap;
  }
  const [nx, ny] = inward(best.ring, best.at.edge);
  const [px, py] = best.at.point;
  // Front (local +y) faces along the inward normal.
  const angle = Math.abs(ny) >= Math.abs(nx) ? (ny > 0 ? 0 : 180) : nx > 0 ? 270 : 90;
  const b = rotatedBoundsSize(w, d, angle);
  if (angle === 0 || angle === 180) return { x: px - b.w / 2, y: ny > 0 ? py : py - b.d, angle };
  return { x: nx > 0 ? px : px - b.w, y: py - b.d / 2, angle };
}

/** A partition end only joins a surface it meets this close to square-on; an oblique square end would poke through it. */
const SQUARE_TOLERANCE_DEG = 10;

/**
 * Where a partition end lands for a point near a wall of the room or the face of another partition:
 * on the nearest of them within `maxDistanceM`, otherwise where it was. Faces, not centre lines, so a T-junction touches without overlapping.
 * With `direction` (the way the partition runs towards this end), only surfaces it meets within 10 degrees of square count.
 */
export function snapPartitionEnd(content: Pick<PlanContent, 'survey' | 'objects'>, point: Point, maxDistanceM: number, direction?: Point): Point {
  const outlines: Ring[] = [
    ...footprintOf(content.survey).flat().filter((r) => r.length > 3),
    ...content.objects.filter(isPartition).flatMap((p) => placementPolygon(p)),
  ];
  const run = direction ? Math.hypot(direction[0], direction[1]) : 0;
  const square = (ring: Ring, edge: number): boolean => {
    if (!direction || run === 0) return true;
    const a = ring[edge]!;
    const b = ring[edge + 1]!;
    const along = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const cosine = Math.abs((direction[0] * (b[0] - a[0]) + direction[1] * (b[1] - a[1])) / (run * along));
    return cosine <= Math.sin((SQUARE_TOLERANCE_DEG * Math.PI) / 180);
  };
  const nearest = outlines
    .map((ring) => ({ ring, at: closestOnRing(ring, point) }))
    .filter(({ ring, at }) => square(ring, at.edge))
    .sort((a, b) => a.at.distance - b.at.distance)[0]?.at;
  return nearest && nearest.distance <= maxDistanceM ? [snapTyped(nearest.point[0]), snapTyped(nearest.point[1])] : point;
}

/**
 * Where a door goes for a pointer near a wall or a partition: against the room's wall facing in, or in the partition's line facing the
 * pointer's side, whichever is nearer. Null when neither is within `maxDistanceM`, so a door can still stand free.
 */
export function snapDoor(content: Pick<PlanContent, 'survey' | 'objects'>, cursor: Point, w: number, d: number, maxDistanceM: number): WallSnap | null {
  const onPartition = snapDoorToPartition(content.objects, cursor, w, d, maxDistanceM);
  const walls = footprintOf(content.survey).flat().filter((r) => r.length > 3);
  const wallDistance = Math.min(Infinity, ...walls.map((ring) => closestOnRing(ring, cursor).distance));
  if (onPartition) {
    const partition = content.objects.find((o) => o.id === onPartition.partitionId);
    const partitionDistance = partition ? Math.min(...placementPolygon(partition).map((ring) => closestOnRing(ring, cursor).distance)) : Infinity;
    if (partitionDistance <= wallDistance) return onPartition;
  }
  return wallDistance <= maxDistanceM ? snapToWall(content.survey, cursor, w, d) : null;
}
