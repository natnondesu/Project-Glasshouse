import { localRectPolygon, localToWorld, type Placement, type Point, type Poly } from './geometry/polygon';
import type { Rack } from './model/types';

type ZoneSource = Placement & Pick<Rack, 'clearance'>;

export interface ClearanceZones {
  front: Poly | null;
  rear: Poly | null;
}

export function clearanceZones(rack: ZoneSource): ClearanceZones {
  const hw = rack.w / 2;
  const hd = rack.d / 2;
  return {
    front: rack.clearance.front > 0 ? localRectPolygon(rack, -hw, hd, hw, hd + rack.clearance.front) : null,
    rear: rack.clearance.rear > 0 ? localRectPolygon(rack, -hw, -hd - rack.clearance.rear, hw, -hd) : null,
  };
}

export function frontEdge(rack: Placement): [Point, Point] {
  const hw = rack.w / 2;
  const hd = rack.d / 2;
  return [localToWorld(rack, [-hw, hd]), localToWorld(rack, [hw, hd])];
}
