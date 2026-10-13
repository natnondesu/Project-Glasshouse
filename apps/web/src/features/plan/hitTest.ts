import { placementPolygon, pointInPolygon, type Point, type RoomObject } from '@glasshouse/domain';

export function hitTest(objects: RoomObject[], point: Point): RoomObject | null {
  for (let i = objects.length - 1; i >= 0; i -= 1) {
    const o = objects[i];
    if (o && pointInPolygon(point, placementPolygon(o))) return o;
  }
  return null;
}
