import { localRectPolygon, overlaps, placementPolygon, type Poly } from '../geometry/polygon';
import type { PlanContent, RoomObject } from '../model/types';
import { effectiveHeight, keepClearOf, verticalSpan } from '../objects';
import { isFlush } from '../sources';
import { formatMetres } from '../units';
import type { Issue } from './types';

const isRackLike = (o: RoomObject): boolean => o.type === 'rack' || o.type === 'existing_rack';

/** The area in front of an object that the planner keeps watch on; null for objects without one, or whose keep-clear depth is 0. */
export function environmentZone(o: RoomObject): Poly | null {
  const depth = keepClearOf(o);
  return depth === null || depth <= 0 ? null : localRectPolygon(o, -o.w / 2, o.d / 2, o.w / 2, o.d / 2 + depth);
}

const approvalNote = 'Approval is still allowed.';

/** Air conditioning and display walls: advice about what stands near them. Always warnings. */
export function environmentIssues(content: PlanContent): Issue[] {
  const issues: Issue[] = [];
  const solids = content.objects.filter((o) => !isFlush(o));
  for (const unit of content.objects) {
    const zone = environmentZone(unit);
    const depth = formatMetres(keepClearOf(unit) ?? 0);
    const footprint = placementPolygon(unit);
    if (unit.type === 'wall_split_ac') {
      for (const rack of solids.filter(isRackLike)) {
        const poly = placementPolygon(rack);
        // Condensate falls: only what stands below the unit's underside is at risk, not a rack hung above it.
        if (overlaps(footprint, poly) && verticalSpan(rack)[1] <= verticalSpan(unit)[0]) {
          issues.push({
            key: `wall_ac_drip:${unit.id}:${rack.id}`,
            code: 'wall_ac_drip',
            severity: 'warn',
            message: `${rack.name} stands under the wall AC; condensate can drip on it.`,
            params: { rack: rack.name, ac: unit.name },
            hint: `Move ${rack.name} out from under ${unit.name}, or move the AC. ${approvalNote}`,
            targets: [rack.id, unit.id],
          });
        }
        if (zone && overlaps(zone, poly)) {
          issues.push({
            key: `wall_ac_airflow:${unit.id}:${rack.id}`,
            code: 'wall_ac_airflow',
            severity: 'warn',
            message: `${rack.name} blocks the airflow within ${depth} m in front of the wall AC.`,
            params: { rack: rack.name, ac: unit.name, depth },
            hint: `Keep the space in front of ${unit.name} clear of racks. ${approvalNote}`,
            targets: [rack.id, unit.id],
          });
        }
      }
    } else if (unit.type === 'precision_ac' && zone) {
      const top = effectiveHeight(unit);
      for (const other of solids) {
        // A door is how people get in; anything hung above the cabinet is not in the way of service.
        if (other.id === unit.id || other.type === 'door' || verticalSpan(other)[0] >= top || !overlaps(zone, placementPolygon(other))) continue;
        issues.push({
          key: `precision_ac_service:${unit.id}:${other.id}`,
          code: 'precision_ac_service',
          severity: 'warn',
          message: `Keep ${depth} m clear in front of the precision AC for service; ${other.name} is in the way.`,
          params: { other: other.name, ac: unit.name, depth },
          hint: `Move ${other.name}, or confirm service access is agreed. ${approvalNote}`,
          targets: [other.id, unit.id],
        });
      }
    } else if (unit.type === 'display_wall' && zone) {
      for (const rack of solids.filter(isRackLike)) {
        if (!overlaps(zone, placementPolygon(rack))) continue;
        issues.push({
          key: `display_wall_view:${unit.id}:${rack.id}`,
          code: 'display_wall_view',
          severity: 'warn',
          message: `${rack.name} stands within ${depth} m in front of the display wall.`,
          params: { rack: rack.name, screen: unit.name, depth },
          hint: `Move ${rack.name} if people need to see ${unit.name}. ${approvalNote}`,
          targets: [rack.id, unit.id],
        });
      }
    }
  }
  return issues;
}
