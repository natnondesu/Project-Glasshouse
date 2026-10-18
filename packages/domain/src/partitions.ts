import { centerOf, localToWorld, pointInPolygon, placementPolygon, topLeftForCenter, worldToLocal, type Placement, type Point } from './geometry/polygon';
import { DEFAULT_SIZES } from './model/defaults';
import type { Metres, RoomObject, SimpleObject } from './model/types';
import { normalizeAngle, snapTyped } from './units';

const ANGLE_STEP_DEG = 45;
/** Two angles this close (degrees, modulo 180) run along the same line. */
const PARALLEL_TOLERANCE_DEG = 0.5;

export const isPartition = (o: RoomObject): o is SimpleObject => o.type === 'partition';

export interface PartitionGeometry {
  /** Top-left of the rotated box, like every object. */
  x: Metres;
  y: Metres;
  /** Length along the line. A zero-length drag gives 0: the caller treats it as a click. */
  w: Metres;
  angle: number;
}

/**
 * A partition drawn from one end to the other: centred between the two points, lying along the line.
 * `snapAngle` (Shift) rounds the direction to 0/45/90/135 degrees and projects the second point onto it.
 * A partition has no front, so the angle is always in [0, 180).
 */
export function partitionFromPoints(a: Point, b: Point, opts: { snapAngle: boolean; thicknessM?: Metres }): PartitionGeometry {
  const thickness = opts.thicknessM ?? DEFAULT_SIZES.partition.d;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  let direction = Math.atan2(dy, dx);
  let length = Math.hypot(dx, dy);
  if (opts.snapAngle && length > 0) {
    const step = (ANGLE_STEP_DEG * Math.PI) / 180;
    direction = Math.round(direction / step) * step;
    length = Math.max(0, dx * Math.cos(direction) + dy * Math.sin(direction));
  }
  const angle = normalizeAngle(((((direction * 180) / Math.PI) % 180) + 180) % 180) % 180;
  const centre: Point = [a[0] + (length * Math.cos(direction)) / 2, a[1] + (length * Math.sin(direction)) / 2];
  const [x, y] = topLeftForCenter(centre, length, thickness, angle);
  return { x, y, w: length, angle };
}

/** The two long faces of a partition: their end points, and the unit normal pointing away from the partition. */
export interface PartitionFace {
  from: Point;
  to: Point;
  normal: Point;
}

export function partitionFaces(p: Placement): [PartitionFace, PartitionFace] {
  const hw = p.w / 2;
  const hd = p.d / 2;
  const origin = localToWorld(p, [0, 0]);
  const toward = (local: Point): Point => {
    const at = localToWorld(p, local);
    return [at[0] - origin[0], at[1] - origin[1]];
  };
  const back = toward([0, -1]);
  const front = toward([0, 1]);
  return [
    { from: localToWorld(p, [-hw, hd]), to: localToWorld(p, [hw, hd]), normal: front },
    { from: localToWorld(p, [-hw, -hd]), to: localToWorld(p, [hw, -hd]), normal: back },
  ];
}

/** Local coordinates of a world point in the partition's frame, and its distance to the partition's box. */
function relativeTo(p: Placement, world: Point): { u: number; v: number; distance: number } {
  const [u, v] = worldToLocal(p, world);
  return { u, v, distance: Math.hypot(Math.max(Math.abs(u) - p.w / 2, 0), Math.max(Math.abs(v) - p.d / 2, 0)) };
}

export interface PartitionSnap {
  x: Metres;
  y: Metres;
  angle: number;
  partitionId: string;
}

/**
 * A door placed or moved near a partition: on the partition's line, centred on its thickness, turned so
 * its front (the swing, or the slide track) faces the side the pointer is on. Null when no partition is within `maxDistanceM`.
 */
export function snapDoorToPartition(partitions: readonly RoomObject[], cursor: Point, w: Metres, d: Metres, maxDistanceM: Metres): PartitionSnap | null {
  const near = partitions
    .filter(isPartition)
    .map((p) => ({ p, at: relativeTo(p, cursor) }))
    .filter(({ at }) => at.distance <= maxDistanceM)
    .sort((a, b) => a.at.distance - b.at.distance)[0];
  if (!near) return null;
  const { p, at } = near;
  const slack = Math.max(0, (p.w - w) / 2);
  const centre = localToWorld(p, [Math.min(Math.max(at.u, -slack), slack), 0]);
  const angle = normalizeAngle(p.angle + (at.v < 0 ? 180 : 0));
  const [x, y] = topLeftForCenter(centre, w, d, angle);
  return { x: snapTyped(x), y: snapTyped(y), angle, partitionId: p.id };
}

/** True when a door sits in the partition's line: parallel to it with its centre inside the partition. */
export function isDoorInPartition(door: RoomObject, partition: RoomObject): boolean {
  if (door.type !== 'door' || !isPartition(partition)) return false;
  const off = Math.abs(((door.angle - partition.angle) % 180) + 180) % 180;
  const parallel = Math.min(off, 180 - off) <= PARALLEL_TOLERANCE_DEG;
  return parallel && pointInPolygon(centerOf(door), placementPolygon(partition));
}
