import type { PlacementTool } from './tools';
import { createObject, DEFAULT_WALL_RACK, snapFloor, snapToWall, snapTyped, WALL_MOUNTED_SOURCES, type PlanContent, type Point, type RoomObject, type RoomObjectType } from '@glasshouse/domain';

/**
 * Where a placement tool drops a new object for a cursor position. The ghost and the click share it.
 * Grid-snap first, then clamp: clamping after snapping could push an object whose size is off the
 * 10 cm grid (a 1.07 m rack, a 0.85 m UPS) back over the wall.
 */
export function placementAt(tool: PlacementTool, world: Point, content: PlanContent): RoomObject {
  const type: RoomObjectType = tool === 'sliding_door' ? 'door' : tool === 'wall_rack' ? 'rack' : tool;
  const made = createObject(type, { x: 0, y: 0 }, content.objects);
  const draft: RoomObject =
    tool === 'sliding_door' && made.type !== 'rack'
      ? { ...made, opening: 'slide' }
      : tool === 'wall_rack' && made.type === 'rack'
        ? { ...made, capacityU: DEFAULT_WALL_RACK.capacityU, w: DEFAULT_WALL_RACK.w, d: DEFAULT_WALL_RACK.d, usableDepthMm: DEFAULT_WALL_RACK.usableDepthMm, wallBottomM: DEFAULT_WALL_RACK.bottomM, clearance: { ...made.clearance, rear: 0 } }
        : made;
  if (tool === 'wall_rack') {
    const wall = snapToWall(content.survey, world, draft.w, draft.d);
    if (wall) return { ...draft, x: snapTyped(wall.x), y: snapTyped(wall.y), angle: wall.angle };
  }
  // Panels, plugs and sockets hang on walls: flat against the nearest one, facing the room.
  const wall = WALL_MOUNTED_SOURCES.has(type as never) ? snapToWall(content.survey, world, draft.w, draft.d) : null;
  if (wall) return { ...draft, x: snapTyped(wall.x), y: snapTyped(wall.y), angle: wall.angle };
  const clamp = (v: number, max: number): number => Math.min(Math.max(0, v), Math.max(0, max));
  return { ...draft, x: clamp(snapFloor(world[0]), content.survey.width - draft.w), y: clamp(snapFloor(world[1]), content.survey.length - draft.d) };
}
