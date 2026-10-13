import { describe, expect, it } from 'vitest';
import { clearanceZones, frontEdge } from './clearance';
import { footprintOf, isDisconnected } from './footprint';
import { area } from './geometry/polygon';

const rect = (id: string, x: number, y: number, w: number, d: number) => ({ id, x, y, w, d });

describe('footprint', () => {
  it('builds an L-shape with a column cut-out', () => {
    const fp = footprintOf({
      floorAreas: [rect('a', 0, 0, 6, 3), rect('b', 0, 3, 3.6, 1.8)],
      cutOuts: [rect('c', 5.4, 0, 0.6, 0.6)],
    });
    expect(area(fp)).toBeCloseTo(24.12);
    expect(isDisconnected(fp)).toBe(false);
  });

  it('detects disconnected floor areas', () => {
    const fp = footprintOf({ floorAreas: [rect('a', 0, 0, 1, 1), rect('b', 3, 0, 1, 1)], cutOuts: [] });
    expect(isDisconnected(fp)).toBe(true);
  });

  it('is empty when there are no areas or a cut-out covers everything', () => {
    expect(footprintOf({ floorAreas: [], cutOuts: [] })).toEqual([]);
    expect(area(footprintOf({ floorAreas: [rect('a', 0, 0, 1, 1)], cutOuts: [rect('c', 0, 0, 2, 2)] }))).toBe(0);
  });
});

describe('clearance zones', () => {
  const rack = { x: 1, y: 1, w: 0.6, d: 1, angle: 0, clearance: { front: 1, rear: 0.6 } };

  it('places the front zone below and the rear zone above at 0°', () => {
    const zones = clearanceZones(rack);
    expect(zones.front).not.toBeNull();
    expect(area([zones.front!])).toBeCloseTo(0.6);
    expect(area([zones.rear!])).toBeCloseTo(0.36);
    const ys = zones.front![0]!.map(([, y]) => y);
    expect(Math.min(...ys)).toBeCloseTo(2);
    expect(Math.max(...ys)).toBeCloseTo(3);
  });

  it('omits a side with zero depth', () => {
    expect(clearanceZones({ ...rack, clearance: { front: 0, rear: 0.6 } }).front).toBeNull();
  });

  it('rotates the front with the rack', () => {
    const [a, b] = frontEdge({ ...rack, angle: 90 });
    expect(a[0]).toBeCloseTo(b[0]);
    expect(a[0]).toBeLessThan(1.5);
  });
});
