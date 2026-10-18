import type { PlacementTool } from './tools';
import { createObject, DEFAULT_WALL_RACK, isPartition, isWallHung, snapDoor, snapFloor, snapToWall, snapTyped, WALL_MOUNTED_SOURCES, type PlanContent, type Point, type RoomObject, type RoomObjectType } from '@glasshouse/domain';

/** How close the pointer must come to a wall or partition for a door to snap into it; farther away the door stands free. */
export const DOOR_SNAP_M = 0.3;

interface Snapped {
  x: number;
  y: number;
  angle: number;
}

/** Doors snap into a wall or partition when the pointer is near one; a split AC and a display wall always hang on the nearest wall. */
function wallSnapFor(o: Pick<RoomObject, 'type' | 'w' | 'd'>, cursor: Point, content: PlanContent): Snapped | null {
  if (o.type === 'door') return snapDoor(content, cursor, o.w, o.d, DOOR_SNAP_M);
  if (!isWallHung(o as RoomObject)) return null;
  const snap = snapToWall(content.survey, cursor, o.w, o.d, content.objects.filter(isPartition));
  return snap ? { x: snap.x, y: snap.y, angle: snap.angle } : null;
}

/**
 * Where a dragged door or wall-hung item lands when its centre is at `cursor`: snapped to a wall or partition, with the angle that goes with it.
 * Null for anything else, and for a door held away from every wall.
 */
export function snapMoved(o: RoomObject, cursor: Point, content: PlanContent): Snapped | null {
  const snap = wallSnapFor(o, cursor, content);
  return snap && { x: snapTyped(snap.x), y: snapTyped(snap.y), angle: snap.angle };
}

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
  const snapped = snapMoved(draft, world, content);
  if (snapped) return { ...draft, ...snapped };
  const clamp = (v: number, max: number): number => Math.min(Math.max(0, v), Math.max(0, max));
  // A partition is placed by its middle: the click is where the wall's centre goes.
  const [ax, ay] = type === 'partition' ? [world[0] - draft.w / 2, world[1] - draft.d / 2] : world;
  return { ...draft, x: clamp(snapFloor(ax), content.survey.width - draft.w), y: clamp(snapFloor(ay), content.survey.length - draft.d) };
}
