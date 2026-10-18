import { FLOOR_STEP_M, partitionFromPoints, snapFloor, snapPartitionEnd, snapTyped, type PartitionGeometry, type PlanContent, type Point } from '@glasshouse/domain';

/** Shorter than this a drag is a slip, not a wall. */
export const MIN_PARTITION_M = 0.2;
/** A drag this close to straight up/down or across is meant to be straight; a slanted wall between two walls would poke through them. */
const AXIS_TOLERANCE_DEG = 3;
const RIGHT_ANGLE_DEG = 90;

const toRad = (deg: number): number => (deg * Math.PI) / 180;

interface DrawOptions {
  /** Shift: the angle goes to 0/45/90/135. */
  snapAngle: boolean;
  snapDistanceM: number;
}

function clampToRoom(content: PlanContent, [x, y]: Point): Point {
  return [Math.min(Math.max(0, x), content.survey.width), Math.min(Math.max(0, y), content.survey.length)];
}

/** `b` moved along the run so it lies exactly on the nearest axis when the drag is within a few degrees of it. */
function straightened(a: Point, b: Point): Point {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  const nearest = Math.round(angle / RIGHT_ANGLE_DEG) * RIGHT_ANGLE_DEG;
  if (Math.abs(angle - nearest) > AXIS_TOLERANCE_DEG) return b;
  const along = dx * Math.cos(toRad(nearest)) + dy * Math.sin(toRad(nearest));
  return [a[0] + along * Math.cos(toRad(nearest)), a[1] + along * Math.sin(toRad(nearest))];
}

/**
 * The partition a drag from `rawA` to `rawB` draws. Each end lands on the 10 cm grid, or on a wall or another partition's face
 * when it arrives there square-on. Null for a drag too short to be a wall.
 */
export function drawnPartition(content: PlanContent, rawA: Point, rawB: Point, { snapAngle, snapDistanceM }: DrawOptions): PartitionGeometry | null {
  const [a0, b0] = [clampToRoom(content, rawA), clampToRoom(content, rawB)];
  const [onGridA, onGridB]: [Point, Point] = [[snapFloor(a0[0]), snapFloor(a0[1])], [snapFloor(b0[0]), snapFloor(b0[1])]];
  const lead = partitionFromPoints(onGridA, onGridB, { snapAngle });
  if (lead.w === 0) return null;
  const run: Point = [Math.cos(toRad(lead.angle)), Math.sin(toRad(lead.angle))];
  const end = (raw: Point, onGrid: Point): Point => {
    if (!snapPartitionEnd(content, raw, snapDistanceM, run).snapped) return onGrid;
    // Onto the surface the pointer was near, but at the grid position along it, so walls end on round figures.
    return snapPartitionEnd(content, onGrid, snapDistanceM + FLOOR_STEP_M, run).point;
  };
  const a = end(a0, onGridA);
  const b = snapAngle ? end(b0, onGridB) : straightened(a, end(b0, onGridB));
  const drawn = partitionFromPoints(a, b, { snapAngle });
  return drawn.w < MIN_PARTITION_M ? null : { x: snapTyped(drawn.x), y: snapTyped(drawn.y), w: snapTyped(drawn.w), angle: drawn.angle };
}
