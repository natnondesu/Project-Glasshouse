import { racksOf } from './devices';
import { centerOf } from './geometry/polygon';
import type { Id, Plan, PlanContent, Rack } from './model/types';
import { err, ok, type Result } from './result';

/** Racks whose centres are this close front to back stand in one row. */
const ROW_TOLERANCE_M = 0.5;

/** The plan's own reading order: rows from the top of the drawing down, each row left to right. */
export function planOrder(racks: Rack[]): Rack[] {
  const placed = racks.map((r) => ({ r, c: centerOf(r) })).sort((a, b) => a.c[1] - b.c[1]);
  const rows: { y: number; items: typeof placed }[] = [];
  for (const p of placed) {
    const row = rows.find((x) => Math.abs(x.y - p.c[1]) <= ROW_TOLERANCE_M);
    if (row) row.items.push(p);
    else rows.push({ y: p.c[1], items: [p] });
  }
  return rows.flatMap((row) => row.items.sort((a, b) => a.c[0] - b.c[0]).map((p) => p.r));
}

/**
 * The order racks are shown in Elevation and on the Install sheet: the team's own order where one is
 * saved, then any rack it doesn't name yet (added later) in plan order.
 */
export function orderedRacks(content: PlanContent, order: readonly Id[] | undefined): Rack[] {
  const racks = planOrder(racksOf(content));
  if (!order?.length) return racks;
  const byId = new Map(racks.map((r) => [r.id, r]));
  const named = order.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
  const rest = racks.filter((r) => !order.includes(r.id));
  return [...named, ...rest];
}

/**
 * Saves the order racks are shown in. Like equipment state it sits beside the revisions, so it can
 * change on an approved plan: it is how the team reads the room, not part of the design. `null` goes
 * back to plan order.
 */
export function setRackOrder(plan: Plan, ids: Id[] | null): Result<Plan> {
  if (ids === null) {
    const { rackOrder: _drop, ...rest } = plan;
    return ok(rest);
  }
  if (new Set(ids).size !== ids.length) return err('invalid_value', 'Each rack appears once in the order.', ids);
  return ok({ ...plan, rackOrder: [...ids] });
}
