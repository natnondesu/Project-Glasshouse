import { describe, expect, it } from 'vitest';
import { checkPlan } from './checks';
import { applyPlanCommand } from './commands/plan';
import { emptyContent } from './factories';
import type { PlanContent, Rack, RoomObject } from './model/types';
import { createObject, verticalSpan } from './objects';

const room = (objects: RoomObject[]): PlanContent => ({ ...emptyContent(), objects });
const rack = (id: string, x: number, y: number, extra: Partial<Rack> = {}): Rack => ({ ...(createObject('rack', { x, y }, []) as Rack), id, name: id.toUpperCase(), capacityU: 12, height: null, ...extra });
const desk = (x: number, y: number): RoomObject => ({ ...createObject('furniture', { x, y }, []), id: 'desk', name: 'DESK-01' });
const codes = (c: PlanContent) => checkPlan(c).map((i) => i.code);

describe('wall-mounted racks', () => {
  it('span from their bottom up; everything else stands on the floor', () => {
    const r = rack('w', 1, 0, { wallBottomM: 1.2 });
    const [bottom, top] = verticalSpan(r);
    expect(bottom).toBe(1.2);
    expect(top).toBeGreaterThan(1.2);
    expect(verticalSpan(desk(1, 0))[0]).toBe(0);
  });

  it('may hang over a desk, but not over a floor rack or another wall rack at the same height', () => {
    const wall = rack('w', 1, 0, { wallBottomM: 1.2, clearance: { front: 0.6, rear: 0 } });
    expect(codes(room([wall, desk(1, 0)]))).not.toContain('object_overlap');
    expect(codes(room([wall, rack('f', 1, 0, { capacityU: 42 })]))).toContain('object_overlap');
    // A short floor cabinet under the wall rack is fine.
    expect(codes(room([wall, rack('f', 1, 0)]))).not.toContain('object_overlap');
    expect(codes(room([wall, rack('w2', 1, 0, { wallBottomM: 1.4, clearance: { front: 0.6, rear: 0 } })]))).toContain('object_overlap');
  });

  it('stack on a wall when their heights do not overlap', () => {
    const low = rack('lo', 1, 0, { wallBottomM: 0.3, clearance: { front: 0.6, rear: 0 } });
    const top = verticalSpan(low)[1];
    const high = rack('hi', 1, 0, { wallBottomM: Math.ceil(top * 10) / 10, clearance: { front: 0.6, rear: 0 } });
    expect(codes(room([low, high]))).not.toContain('object_overlap');
  });

  it('is set and cleared through the inspector patch, within limits', () => {
    const c = room([rack('r', 1, 1)]);
    const up = applyPlanCommand(c, { type: 'object/update', id: 'r', patch: { wallBottomM: 1.2 } });
    if (!up.ok) throw new Error(up.error.message);
    expect(up.value.objects[0]).toMatchObject({ wallBottomM: 1.2 });
    const down = applyPlanCommand(up.value, { type: 'object/update', id: 'r', patch: { wallBottomM: null } });
    if (!down.ok) throw new Error(down.error.message);
    expect(down.value.objects[0]).not.toHaveProperty('wallBottomM');
    expect(applyPlanCommand(c, { type: 'object/update', id: 'r', patch: { wallBottomM: -0.1 } })).toMatchObject({ ok: false });
    expect(applyPlanCommand(c, { type: 'object/update', id: 'r', patch: { wallBottomM: 9.5 } })).toMatchObject({ ok: false, error: { message: expect.stringContaining('at most') } });
    const desk1 = room([desk(1, 1)]);
    expect(applyPlanCommand(desk1, { type: 'object/update', id: 'desk', patch: { wallBottomM: 1 } })).toMatchObject({ ok: false, error: { message: 'DESK-01 is not a rack.' } });
  });
});
