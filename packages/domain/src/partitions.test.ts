import { describe, expect, it } from 'vitest';
import { checkPlan } from './checks';
import { applyPlanCommand } from './commands/plan';
import { emptyContent } from './factories';
import { centerOf } from './geometry/polygon';
import type { PlanContent, Rack, RoomObject, SimpleObject } from './model/types';
import { createObject } from './objects';
import { pasteObject } from './objectPaste';
import { isDoorInPartition, partitionFromPoints, snapDoorToPartition } from './partitions';
import { snapPartitionEnd, snapToWall } from './walls';

const content = (objects: RoomObject[] = []): PlanContent => {
  const base = emptyContent();
  return { ...base, survey: { ...base.survey, width: 6, length: 5, floorAreas: [{ id: 'a', x: 0, y: 0, w: 6, d: 5 }] }, objects };
};
const make = (type: SimpleObject['type'], name: string, x: number, y: number, extra: Partial<SimpleObject> = {}): SimpleObject =>
  ({ ...(createObject(type, { x, y }, []) as SimpleObject), id: name.toLowerCase(), name, ...extra });
const codes = (c: PlanContent) => checkPlan(c).map((i) => i.code);
/** A 2.00 m partition lying along y = 2.05, from x = 2 to 4. */
const wall = make('partition', 'PT-01', 2, 2);

describe('partitionFromPoints', () => {
  it('centres the default thickness on the line between the two points', () => {
    const p = partitionFromPoints([1, 2], [3, 2], { snapAngle: false });
    expect(p).toMatchObject({ w: 2, angle: 0 });
    expect(p.x).toBeCloseTo(1);
    expect(p.y).toBeCloseTo(1.95);
    const v = partitionFromPoints([1, 1], [1, 3], { snapAngle: false });
    expect(v).toMatchObject({ w: 2, angle: 90 });
    expect(v.x).toBeCloseTo(0.95);
    expect(v.y).toBeCloseTo(1);
  });

  it('is the same partition whichever end is dragged from', () => {
    const forward = partitionFromPoints([0, 0], [2, 2], { snapAngle: false });
    const back = partitionFromPoints([2, 2], [0, 0], { snapAngle: false });
    expect(forward.angle).toBeCloseTo(45);
    expect(forward.w).toBeCloseTo(Math.SQRT2 * 2);
    expect(back.angle).toBeCloseTo(45);
    expect(back.x).toBeCloseTo(forward.x);
    expect(back.y).toBeCloseTo(forward.y);
  });

  it('keeps a free angle without Shift', () => {
    expect(partitionFromPoints([0, 0], [3, 0.5], { snapAngle: false }).angle).toBeCloseTo(9.46, 1);
  });

  it('snaps the angle to 0, 45 and 90 degrees with Shift, projecting the second point onto it', () => {
    expect(partitionFromPoints([0, 0], [3, 0.5], { snapAngle: true })).toMatchObject({ angle: 0, w: 3 });
    expect(partitionFromPoints([0, 0], [-0.2, 1.1], { snapAngle: true })).toMatchObject({ angle: 90, w: 1.1 });
    const diagonal = partitionFromPoints([0, 0], [2, 1.7], { snapAngle: true });
    expect(diagonal.angle).toBe(45);
    expect(diagonal.w).toBeCloseTo(3.7 / Math.SQRT2);
    const leftward = partitionFromPoints([2, 1], [0.5, 1.1], { snapAngle: true });
    expect(leftward).toMatchObject({ angle: 0 });
    expect(leftward.w).toBeCloseTo(1.5);
  });

  it('uses the thickness given, so the box still sits on the line', () => {
    const p = partitionFromPoints([1, 2], [3, 2], { snapAngle: false, thicknessM: 0.2 });
    expect(p.y).toBeCloseTo(1.9);
  });

  it('gives a zero-length drag a zero width for the caller to treat as a click', () => {
    expect(partitionFromPoints([1, 1], [1, 1], { snapAngle: false }).w).toBe(0);
  });
});

describe('snapPartitionEnd', () => {
  it('snaps to the room walls within the distance, and leaves points beyond it alone', () => {
    expect(snapPartitionEnd(content(), [0.08, 2], 0.15)).toEqual([0, 2]);
    expect(snapPartitionEnd(content(), [3, 4.93], 0.15)).toEqual([3, 5]);
    expect(snapPartitionEnd(content(), [3, 2], 0.15)).toEqual([3, 2]);
  });

  it('snaps to the face of another partition so a T-junction touches without overlapping', () => {
    const [x, y] = snapPartitionEnd(content([wall]), [3, 1.9], 0.15);
    expect(x).toBeCloseTo(3);
    expect(y).toBeCloseTo(2);
    const branch = partitionFromPoints([3, 0], [x, y], { snapAngle: false });
    expect(codes(content([wall, { ...make('partition', 'PT-02', 0, 0), ...branch, d: 0.1 }]))).not.toContain('object_overlap');
  });

  it('takes the nearest of walls and partitions', () => {
    expect(snapPartitionEnd(content([wall]), [2.05, 1.95], 0.2)).toEqual([2.05, 2]);
    const near = snapPartitionEnd(content([make('partition', 'PT-01', 0.3, 2)]), [0.12, 2.05], 0.2);
    expect(near[0]).toBeCloseTo(0);
  });
});

describe('snapToWall with partitions', () => {
  const plain = content().survey;
  const ac = (cursor: [number, number], partitions: SimpleObject[], w = 0.9, d = 0.25) => snapToWall(plain, cursor, w, d, partitions);

  it('keeps the outer-wall result when no partition is nearer', () => {
    expect(ac([3, 0.2], [wall])).toEqual({ x: 2.55, y: 0, angle: 0 });
    expect(snapToWall(plain, [3, 0.3], 0.5, 0.2)).toEqual({ x: 2.75, y: 0, angle: 0 });
  });

  it('puts the back against the partition face on the pointer side, front to that side', () => {
    expect(ac([3, 1.8], [wall])).toMatchObject({ x: 2.55, y: 1.75, angle: 180, partitionId: 'pt-01' });
    expect(ac([3, 2.3], [wall])).toMatchObject({ x: 2.55, y: 2.1, angle: 0, partitionId: 'pt-01' });
  });

  it('stays on the partition near its end', () => {
    const near = ac([2.1, 1.8], [wall])!;
    expect(near.x).toBeCloseTo(2);
    expect(near.angle).toBe(180);
  });

  it('works on a turned partition', () => {
    const vertical = make('partition', 'PT-01', 3, 1, { angle: 90 });
    const snap = ac([2.8, 2], [vertical])!;
    expect(snap).toMatchObject({ angle: 90 });
    expect(snap.x).toBeCloseTo(2.75);
    expect(snap.y).toBeCloseTo(1.55);
  });

  it('a snapped split AC does not overlap the partition it hangs on', () => {
    const snap = ac([3, 1.8], [wall])!;
    const hung = make('wall_split_ac', 'AC-01', snap.x, snap.y, { angle: snap.angle });
    expect(codes(content([wall, hung]))).not.toContain('object_overlap');
  });
});

describe('door in a partition', () => {
  const door = make('door', 'D-01', 2.55, 2.0, { w: 0.9, d: 0.1 });

  it('snaps into the partition line, centred on its thickness, swinging towards the pointer side', () => {
    const north = snapDoorToPartition([wall], [3, 1.7], 0.9, 0.1, 0.5)!;
    expect(north).toMatchObject({ angle: 180, partitionId: 'pt-01' });
    expect(north.x).toBeCloseTo(2.55);
    expect(north.y).toBeCloseTo(2);
    const south = snapDoorToPartition([wall], [3, 2.5], 0.9, 0.1, 0.5)!;
    expect(south.angle).toBe(0);
    expect(south.x).toBeCloseTo(2.55);
    expect(south.y).toBeCloseTo(2);
  });

  it('keeps the door on the partition and follows the pointer along it', () => {
    expect(snapDoorToPartition([wall], [2.2, 1.7], 0.9, 0.1, 0.5)!.x).toBeCloseTo(2);
    expect(snapDoorToPartition([wall], [3.9, 2.4], 0.9, 0.1, 0.5)!.x).toBeCloseTo(3.1);
  });

  it('snaps into a turned partition with the door turned along it', () => {
    const vertical = make('partition', 'PT-01', 3, 1, { angle: 90 });
    const east = snapDoorToPartition([vertical], [3.4, 2], 0.9, 0.1, 0.5)!;
    expect(east.angle).toBe(270);
    expect(centerOf({ ...east, w: 0.9, d: 0.1 })[0]).toBeCloseTo(3.05);
    expect(snapDoorToPartition([vertical], [2.7, 2], 0.9, 0.1, 0.5)!.angle).toBe(90);
  });

  it('does not snap when the pointer is farther than the snap distance, or with no partitions', () => {
    expect(snapDoorToPartition([wall], [3, 3.5], 0.9, 0.1, 0.5)).toBeNull();
    expect(snapDoorToPartition([], [3, 2], 0.9, 0.1, 0.5)).toBeNull();
  });

  it('is not reported as overlapping the partition it sits in, swing or sliding, whichever side', () => {
    expect(isDoorInPartition(door, wall)).toBe(true);
    expect(codes(content([wall, door]))).not.toContain('object_overlap');
    expect(codes(content([wall, { ...door, opening: 'slide' }]))).not.toContain('object_overlap');
    expect(codes(content([wall, { ...door, angle: 180, x: 2.55 }]))).not.toContain('object_overlap');
    expect(codes(content([door, wall]))).not.toContain('object_overlap');
  });

  it('still overlaps when the door lies across the partition or beside it', () => {
    const across = { ...door, angle: 90, x: 3.0, y: 1.6 };
    expect(isDoorInPartition(across, wall)).toBe(false);
    expect(codes(content([wall, across]))).toContain('object_overlap');
    const beside = { ...door, y: 2.07 };
    expect(isDoorInPartition(beside, wall)).toBe(false);
    expect(codes(content([wall, beside]))).toContain('object_overlap');
  });

  it('only exempts the partition: a desk in the doorway still overlaps the door', () => {
    expect(codes(content([wall, door, make('furniture', 'F-01', 2.6, 1.95, { w: 0.5, d: 0.3 })]))).toContain('object_overlap');
  });
});

describe('partition as an obstacle', () => {
  const rackAt = (name: string, x: number, y: number, extra: Partial<Rack> = {}): Rack => ({ ...(createObject('rack', { x, y }, []) as Rack), name, ...extra });

  it('blocks racks, existing racks, furniture, power gear and other partitions overlapping it', () => {
    for (const other of [rackAt('RK-01', 2.5, 1.5), make('existing_rack', 'EX-01', 2.5, 1.5), make('furniture', 'F-01', 2.5, 1.9), make('ups', 'UPS-01', 2.5, 1.5), make('pdu', 'PDU-01', 2.5, 1.95), make('partition', 'PT-02', 3, 1.5, { angle: 90 })]) {
      const issues = checkPlan(content([wall, other])).filter((i) => i.code === 'object_overlap');
      expect(issues).toHaveLength(1);
      expect(issues[0]).toMatchObject({ severity: 'block', message: `PT-01 overlaps ${other.name}.` });
    }
  });

  it('allows touching edges', () => {
    expect(codes(content([wall, make('furniture', 'F-01', 2.5, 2.1)]))).not.toContain('object_overlap');
  });

  it('flags a rack clearance zone crossing it exactly like furniture', () => {
    const facing = rackAt('RK-01', 2.6, 0.2, { clearance: { front: 1, rear: 0 } });
    const crossing = checkPlan(content([wall, facing])).filter((i) => i.code === 'clearance_obstructed');
    const withDesk = checkPlan(content([make('furniture', 'F-01', 2, 2, { w: 2, d: 0.1 }), facing])).filter((i) => i.code === 'clearance_obstructed');
    expect(crossing).toHaveLength(1);
    expect(crossing[0]).toMatchObject({ severity: 'block', message: 'PT-01 sits inside the front clearance zone of RK-01.' });
    expect(withDesk[0]).toMatchObject({ severity: crossing[0]!.severity, code: crossing[0]!.code });
  });

  it('must be on the floor like anything else', () => {
    expect(codes(content([make('partition', 'PT-01', 5.5, 2)]))).toContain('object_outside_footprint');
  });
});

describe('new object types in the model', () => {
  it('have the defaults from the plan', () => {
    const at = { x: 1, y: 1 };
    expect(createObject('partition', at, [])).toMatchObject({ type: 'partition', name: 'PT-01', w: 2, d: 0.1, angle: 0, height: null });
    expect(createObject('wall_split_ac', at, [])).toMatchObject({ name: 'AC-01', w: 0.9, d: 0.25, wallBottomM: 2.2 });
    expect(createObject('precision_ac', at, [])).toMatchObject({ name: 'PAC-01', w: 0.8, d: 0.8 });
    expect(createObject('precision_ac', at, [])).not.toHaveProperty('wallBottomM');
    expect(createObject('display_wall', at, [])).toMatchObject({ name: 'DW-01', w: 3, d: 0.15, wallBottomM: 0.8 });
  });

  it('are named after the existing ones of their type', () => {
    expect(createObject('partition', { x: 0, y: 0 }, [{ name: 'PT-01' }, { name: 'PT-07' }, { name: 'PAC-09' }]).name).toBe('PT-08');
    expect(createObject('precision_ac', { x: 0, y: 0 }, [{ name: 'PT-01' }, { name: 'PAC-02' }]).name).toBe('PAC-03');
  });

  it('stand at their default heights', async () => {
    const { effectiveHeight, verticalSpan } = await import('./objects');
    const at = { x: 1, y: 1 };
    expect(effectiveHeight(createObject('partition', at, []))).toBe(2.4);
    expect(effectiveHeight(createObject('precision_ac', at, []))).toBe(1.95);
    expect(verticalSpan(createObject('wall_split_ac', at, []))).toEqual([2.2, 2.5]);
    const dw = verticalSpan(createObject('display_wall', at, []));
    expect(dw[0]).toBe(0.8);
    expect(dw[1]).toBeCloseTo(2.5);
  });

  it('survive copy and paste with their angle and wall height', () => {
    const ac = make('wall_split_ac', 'AC-01', 2, 0, { wallBottomM: 2.4, angle: 0 });
    const pasted = pasteObject(content([ac]), { type: 'object/paste', id: 'copy', source: ac, at: { x: 4, y: 0 }, ids: {}, templates: [] });
    expect(pasted.ok && pasted.value.objects[1]).toMatchObject({ type: 'wall_split_ac', name: 'AC-02', x: 4, wallBottomM: 2.4 });
    const part = make('partition', 'PT-01', 1, 1, { angle: 30, w: 3 });
    const copy = pasteObject(content([part]), { type: 'object/paste', id: 'copy', source: part, at: { x: 3, y: 3 }, ids: {}, templates: [] });
    expect(copy.ok && copy.value.objects[1]).toMatchObject({ type: 'partition', name: 'PT-02', angle: 30, w: 3 });
  });

  it('can be moved, resized, rotated, copied and have their height set like other objects', () => {
    const c = content([wall]);
    const resized = applyPlanCommand(c, { type: 'object/update', id: 'pt-01', patch: { w: 3, d: 0.15 } });
    expect(resized.ok && resized.value.objects[0]).toMatchObject({ w: 3, d: 0.15 });
    const turned = applyPlanCommand(c, { type: 'object/rotate', id: 'pt-01', by: 45 });
    expect(turned.ok).toBe(true);
    const ac = content([make('wall_split_ac', 'AC-01', 2, 0)]);
    const raised = applyPlanCommand(ac, { type: 'object/update', id: 'ac-01', patch: { wallBottomM: 2.0 } });
    expect(raised.ok && raised.value.objects[0]).toMatchObject({ wallBottomM: 2 });
    expect(applyPlanCommand(ac, { type: 'object/update', id: 'ac-01', patch: { wallBottomM: 9.5 } })).toMatchObject({ ok: false });
    expect(applyPlanCommand(ac, { type: 'object/update', id: 'ac-01', patch: { wallBottomM: -1 } })).toMatchObject({ ok: false });
    expect(applyPlanCommand(ac, { type: 'object/update', id: 'ac-01', patch: { wallBottomM: null } })).toMatchObject({ ok: false });
    expect(applyPlanCommand(c, { type: 'object/update', id: 'pt-01', patch: { wallBottomM: 1 } })).toMatchObject({ ok: false });
    expect(applyPlanCommand(ac, { type: 'object/update', id: 'ac-01', patch: { capacityU: 12 } })).toMatchObject({ ok: false });
  });
});
