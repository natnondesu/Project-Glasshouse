import { createObject, emptyContent, type PlanContent, type RoomObject } from '@glasshouse/domain';
import { describe, expect, it } from 'vitest';
import { nearestGaps } from './gaps';

// Default room: 5 × 4 m, one floor area.
function room(...objects: RoomObject[]): PlanContent {
  return { ...emptyContent(), objects };
}
const box = (id: string, x: number, y: number, w = 0.6, d = 1, angle = 0): RoomObject => ({ ...createObject('furniture', { x, y }, []), id, name: id.toUpperCase(), w, d, angle });

describe('nearestGaps', () => {
  it('measures to the walls when nothing is in the way', () => {
    const o = box('a', 1, 1);
    const gaps = Object.fromEntries(nearestGaps(o, room(o)).map((g) => [g.side, g]));
    expect(gaps.left).toMatchObject({ distance: 1, target: 'Wall' });
    expect(gaps.top?.distance).toBeCloseTo(1);
    expect(gaps.right?.distance).toBeCloseTo(3.4);
    expect(gaps.bottom?.distance).toBeCloseTo(2);
  });

  it('stops at the nearest object, even one offset from the centre line', () => {
    const o = box('a', 1, 1);
    const neighbour = box('b', 2.1, 1.7, 0.6, 1);
    const gaps = Object.fromEntries(nearestGaps(o, room(o, neighbour)).map((g) => [g.side, g]));
    expect(gaps.right).toMatchObject({ target: 'B' });
    expect(gaps.right?.distance).toBeCloseTo(0.5);
  });

  it('sees rotated neighbours and ignores the object itself', () => {
    const o = box('a', 1, 1);
    const tilted = box('b', 1, 2.6, 0.6, 0.6, 45);
    const gaps = Object.fromEntries(nearestGaps(o, room(o, tilted)).map((g) => [g.side, g]));
    expect(gaps.bottom?.target).toBe('B');
    expect(gaps.bottom!.distance).toBeLessThan(2);
    expect(nearestGaps(o, room(o)).every((g) => g.target !== 'A')).toBe(true);
  });
});
