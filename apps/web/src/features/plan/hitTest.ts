import { placementPolygon, pointInPolygon, worldToLocal, type Point, type RoomObject } from '@glasshouse/domain';

/** Bottom to top: partitions are walls, so doors, units and everything else stand over them whichever was added last. */
export function inDrawOrder(objects: RoomObject[]): RoomObject[] {
  return [...objects.filter((o) => o.type === 'partition'), ...objects.filter((o) => o.type !== 'partition')];
}

/** Within `marginM` of the box, in the object's own frame. */
const nearBox = (o: RoomObject, point: Point, marginM: number): boolean => {
  const [u, v] = worldToLocal(o, point);
  return Math.abs(u) <= o.w / 2 + marginM && Math.abs(v) <= o.d / 2 + marginM;
};

/**
 * The topmost object under the point. `marginM` (a few pixels' worth) also lets a partition be grabbed
 * beside its line, since at room scale it is only a few pixels thick; anything actually under the point wins over that.
 */
export function hitTest(objects: RoomObject[], point: Point, marginM = 0): RoomObject | null {
  const ordered = inDrawOrder(objects);
  for (let i = ordered.length - 1; i >= 0; i -= 1) {
    const o = ordered[i];
    if (o && pointInPolygon(point, placementPolygon(o))) return o;
  }
  if (marginM <= 0) return null;
  return ordered.reverse().find((o) => o.type === 'partition' && nearBox(o, point, marginM)) ?? null;
}
