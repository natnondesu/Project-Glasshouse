import { clearanceZones } from '../clearance';
import { footprintOf, isDisconnected } from '../footprint';
import { area, containedIn, EPS_AREA, overlaps, placementPolygon, type Poly } from '../geometry/polygon';
import type { PlanContent, RoomObject } from '../model/types';
import type { Issue } from './types';
import { isFlush } from '../sources';
import { heightsOverlap, verticalSpan } from '../objects';
import { isDoorInPartition } from '../partitions';

interface Shape {
  object: RoomObject;
  poly: Poly;
}

export function placementIssues(content: PlanContent): Issue[] {
  const fp = footprintOf(content.survey);
  const hasFloor = area(fp) > EPS_AREA;
  const issues: Issue[] = [];

  if (!hasFloor) {
    issues.push({
      key: 'footprint_empty',
      code: 'footprint_empty',
      severity: 'block',
      message: 'The room has no floor area.',
      params: {},
      hint: 'Add a floor area with the Add area tool.',
      targets: [],
    });
  } else if (isDisconnected(fp)) {
    issues.push({
      key: 'footprint_disconnected',
      code: 'footprint_disconnected',
      severity: 'warn',
      message: 'The floor has separate, unconnected areas.',
      params: {},
      hint: 'Check this matches the survey. Approval is still allowed.',
      targets: [],
    });
  }

  const shapes: Shape[] = content.objects.map((object) => ({ object, poly: placementPolygon(object) }));

  if (hasFloor) {
    for (const { object, poly } of shapes) {
      if (object.type === 'door' || containedIn(poly, fp)) continue;
      issues.push({
        key: `object_outside_footprint:${object.id}`,
        code: 'object_outside_footprint',
        severity: 'block',
        message: `${object.name} is not fully on the floor.`,
        params: { name: object.name },
        hint: 'Move it onto the floor, or adjust the floor areas.',
        targets: [object.id],
      });
    }
  }

  shapes.forEach((a, i) => {
    if (isFlush(a.object)) return;
    for (const b of shapes.slice(i + 1)) {
      if (isFlush(b.object) || !overlaps(a.poly, b.poly) || !heightsOverlap(a.object, b.object)) continue;
      if (isDoorInPartition(a.object, b.object) || isDoorInPartition(b.object, a.object)) continue;
      issues.push({
        key: `object_overlap:${a.object.id}:${b.object.id}`,
        code: 'object_overlap',
        severity: 'block',
        message: `${a.object.name} overlaps ${b.object.name}.`,
        params: { a: a.object.name, b: b.object.name },
        hint: 'Move one of them. Touching edges is fine.',
        targets: [a.object.id, b.object.id],
      });
    }
  });

  for (const { object: rack } of shapes) {
    if (rack.type !== 'rack') continue;
    const zones = clearanceZones(rack);
    const rackTop = verticalSpan(rack)[1];
    for (const side of ['front', 'rear'] as const) {
      const zone = zones[side];
      if (!zone) continue;
      if (hasFloor && !containedIn(zone, fp)) {
        issues.push({
          key: `clearance_outside_footprint:${rack.id}:${side}`,
          code: 'clearance_outside_footprint',
          severity: 'block',
          message: `The ${side} clearance of ${rack.name} runs outside the floor.`,
          params: { side, rack: rack.name },
          hint: `Turn or move the rack, or reduce its ${side} clearance.`,
          targets: [rack.id],
        });
      }
      for (const other of shapes) {
        // Hung above the rack (a split AC on the wall over an aisle) is not in the way.
        if (other.object.id === rack.id || isFlush(other.object) || verticalSpan(other.object)[0] >= rackTop || !overlaps(zone, other.poly)) continue;
        const isDoor = other.object.type === 'door';
        const isSliding = isDoor && other.object.type !== 'rack' && other.object.opening === 'slide';
        issues.push({
          key: `clearance:${rack.id}:${side}:${other.object.id}`,
          code: isSliding ? 'clearance_sliding_door' : isDoor ? 'clearance_door' : 'clearance_obstructed',
          severity: isDoor ? 'warn' : 'block',
          params: { other: other.object.name, side, rack: rack.name },
          message: isDoor
            ? `${other.object.name} is inside the ${side} clearance of ${rack.name}.`
            : `${other.object.name} sits inside the ${side} clearance zone of ${rack.name}.`,
          hint: isSliding
            ? 'Usually fine: a sliding door needs no swing space. Keep the opening itself clear.'
            : isDoor
            ? 'Usually fine for a doorway. Confirm the door swing does not hit the rack.'
            : `Move ${other.object.name}, or reduce ${rack.name}'s ${side} clearance if agreed.`,
          targets: [other.object.id, rack.id],
        });
      }
    }
  }
  return issues;
}
