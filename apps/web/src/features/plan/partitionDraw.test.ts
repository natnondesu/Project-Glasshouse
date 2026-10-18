import { checkPlan, createObject, emptyContent, partitionFromPoints, type PlanContent, type RoomObject } from '@glasshouse/domain';
import { expect, it } from 'vitest';
import { drawnPartition, MIN_PARTITION_M } from './partitionDraw';

const room: PlanContent = { ...emptyContent(), survey: { ...emptyContent().survey, width: 6, length: 5, floorAreas: [{ id: 'a', x: 0, y: 0, w: 6, d: 5 }] } };
const SNAP = 0.15;
const draw = (a: [number, number], b: [number, number], snapAngle = false, content = room) => drawnPartition(content, a, b, { snapAngle, snapDistanceM: SNAP });
const asObject = (g: NonNullable<ReturnType<typeof draw>>): RoomObject => ({ ...createObject('partition', { x: g.x, y: g.y }, []), w: g.w, angle: g.angle });

it('lies along the two points on the 10 cm grid', () => {
  const g = draw([1.02, 2.98], [3.96, 3.01])!;
  expect(g).toMatchObject({ w: 3, angle: 0 });
  expect(g.x).toBeCloseTo(1);
  expect(g.y).toBeCloseTo(2.95);
});

it('lets an end meet a wall that it arrives at square-on, even off the grid', () => {
  // Down from the top wall to 6 cm short of the bottom wall: the end lands on the wall.
  const g = draw([3, 0.04], [3, 4.94])!;
  expect(g.angle).toBe(90);
  expect(g.w).toBeCloseTo(5);
  expect(checkPlan({ ...room, objects: [asObject(g)] }).map((i) => i.code)).toEqual([]);
});

it('puts a wall-to-wall partition at round figures along the wall, wherever between grid lines the pointer was', () => {
  const g = draw([3.97, 0.04], [4.02, 4.94])!;
  expect(g.angle).toBe(90);
  expect(g.x + 0.05).toBeCloseTo(4);
  expect(g.w).toBeCloseTo(5);
});

it('does not pull an end that slides in at a slant onto the wall', () => {
  const g = draw([1, 1], [3.9, 4.93])!;
  expect(g.w).toBeCloseTo(Math.hypot(2.9, 3.9), 1);
  expect(g.angle).not.toBe(90);
});

it('snaps to exactly vertical or horizontal when the drag is within a few degrees of it, so a wall to wall run stays inside the room', () => {
  const g = draw([3, 0], [3.2, 5])!;
  expect(g.angle).toBe(90);
  expect(g.w).toBeCloseTo(5);
  expect(checkPlan({ ...room, objects: [asObject(g)] }).map((i) => i.code)).toEqual([]);
});

it('keeps a free angle when the drag is plainly diagonal', () => {
  expect(draw([1, 1], [3, 2.5])!.angle).toBeCloseTo(36.87, 0);
});

it('snaps the angle to 45 degrees with Shift', () => {
  const g = draw([1, 1], [3, 2.8], true)!;
  expect(g.angle).toBe(45);
});

it('ends on the face of another partition for a T-junction that touches without overlapping', () => {
  const across = { ...createObject('partition', { x: 1, y: 2 }, []), id: 'pt', name: 'PT-01', w: 4 } as RoomObject;
  const g = draw([3, 0.04], [3.02, 1.92], false, { ...room, objects: [across] })!;
  expect(g.angle).toBe(90);
  expect(g.w).toBeCloseTo(2);
  expect(checkPlan({ ...room, objects: [across, { ...asObject(g), id: 'pt2', name: 'PT-02' }] }).map((i) => i.code)).not.toContain('object_overlap');
});

it('keeps both ends inside the room when the pointer leaves it', () => {
  const g = draw([5.5, 2], [9, 2])!;
  expect(g.x + g.w).toBeLessThanOrEqual(6 + 1e-9);
});

it('is nothing when the drag is shorter than the shortest wall', () => {
  expect(draw([2, 2], [2 + MIN_PARTITION_M / 2, 2])).toBeNull();
  expect(partitionFromPoints([0, 0], [0, 0], { snapAngle: false }).w).toBe(0);
});
