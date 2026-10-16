import { describe, expect, it } from 'vitest';
import { createPlan, emptyContent } from './factories';
import type { PlanContent, Rack } from './model/types';
import { createObject } from './objects';
import { orderedRacks, planOrder, setRackOrder } from './rackOrder';

const rack = (id: string, x: number, y: number): Rack => ({ ...(createObject('rack', { x, y }, []) as Rack), id, name: id });
const content = (racks: Rack[]): PlanContent => ({ ...emptyContent(), objects: racks });

describe('rack order', () => {
  it('reads the plan in rows, top to bottom, each left to right, even when a row is a little ragged', () => {
    const racks = [rack('B2', 2, 3.1), rack('A2', 2, 0.5), rack('A1', 1, 0.7), rack('B1', 1, 3)];
    expect(planOrder(racks).map((r) => r.id)).toEqual(['A1', 'A2', 'B1', 'B2']);
  });

  it('follows a saved order, puts racks added later after it in plan order, and ignores racks since removed', () => {
    const c = content([rack('A1', 1, 0.5), rack('A2', 2, 0.5), rack('A3', 3, 0.5)]);
    expect(orderedRacks(c, ['A3', 'gone', 'A1']).map((r) => r.id)).toEqual(['A3', 'A1', 'A2']);
    expect(orderedRacks(c, undefined).map((r) => r.id)).toEqual(['A1', 'A2', 'A3']);
  });

  it('saves and clears the order on the plan, refusing a rack listed twice', () => {
    const plan = createPlan();
    const saved = setRackOrder(plan, ['A2', 'A1']);
    expect(saved.ok && saved.value.rackOrder).toEqual(['A2', 'A1']);
    const cleared = setRackOrder(saved.ok ? saved.value : plan, null);
    expect(cleared.ok && 'rackOrder' in cleared.value).toBe(false);
    expect(setRackOrder(plan, ['A1', 'A1']).ok).toBe(false);
  });
});
