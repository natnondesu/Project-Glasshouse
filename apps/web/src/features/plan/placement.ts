import { createObject, snapFloor, snapToWall, snapTyped, WALL_MOUNTED_SOURCES, type PlanContent, type Point, type RoomObject, type RoomObjectType } from '@glasshouse/domain';

/**
 * Where a placement tool drops a new object for a cursor position. The ghost and the click share it.
 * Grid-snap first, then clamp: clamping after snapping could push an object whose size is off the
 * 10 cm grid (a 1.07 m rack, a 0.85 m UPS) back over the wall.
 */
export function placementAt(type: RoomObjectType, world: Point, content: PlanContent): RoomObject {
  const draft = createObject(type, { x: 0, y: 0 }, content.objects);
  // Panels, plugs and sockets hang on walls: flat against the nearest one, facing the room.
  const wall = WALL_MOUNTED_SOURCES.has(type as never) ? snapToWall(content.survey, world, draft.w, draft.d) : null;
  if (wall) return { ...draft, x: snapTyped(wall.x), y: snapTyped(wall.y), angle: wall.angle };
  const clamp = (v: number, max: number): number => Math.min(Math.max(0, v), Math.max(0, max));
  return { ...draft, x: clamp(snapFloor(world[0]), content.survey.width - draft.w), y: clamp(snapFloor(world[1]), content.survey.length - draft.d) };
}
