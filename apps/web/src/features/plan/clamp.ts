import { rotatedBoundsSize, snapTyped, type Survey } from '@glasshouse/domain';

/** Keeps a dragged object inside the room canvas so overshooting a wall stops at the wall instead of discarding the move. */
export function clampIntoRoom(
  o: { w: number; d: number; angle: number },
  x: number,
  y: number,
  room: Pick<Survey, 'width' | 'length'>,
): { x: number; y: number } {
  const b = rotatedBoundsSize(o.w, o.d, o.angle);
  return {
    x: snapTyped(Math.min(Math.max(0, x), Math.max(0, room.width - b.w))),
    y: snapTyped(Math.min(Math.max(0, y), Math.max(0, room.length - b.d))),
  };
}
