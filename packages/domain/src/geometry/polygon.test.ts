import { describe, expect, it } from 'vitest';
import {
  area,
  centerOf,
  containedIn,
  difference,
  overlaps,
  placementPolygon,
  placementWithin,
  pointInPolygon,
  rectPolygon,
  rotatedBoundsSize,
  topLeftForCenter,
  union,
  worldToLocal,
  localToWorld,
} from './polygon';

describe('rotated placements', () => {
  it('computes rotated bounding size', () => {
    const b = rotatedBoundsSize(2, 1, 90);
    expect(b.w).toBeCloseTo(1);
    expect(b.d).toBeCloseTo(2);
  });

  it('keeps the centre when re-deriving the top-left for a new angle', () => {
    const p = { x: 0, y: 0, w: 2, d: 1, angle: 0 };
    const [x, y] = topLeftForCenter(centerOf(p), 2, 1, 90);
    expect(x).toBeCloseTo(0.5);
    expect(y).toBeCloseTo(-0.5);
  });

  it('round-trips local and world coordinates', () => {
    const p = { x: 1, y: 2, w: 0.6, d: 1.07, angle: 37 };
    const [lx, ly] = worldToLocal(p, localToWorld(p, [0.2, -0.3]));
    expect(lx).toBeCloseTo(0.2);
    expect(ly).toBeCloseTo(-0.3);
  });

  it('matches the axis-aligned rectangle at 0°', () => {
    expect(area([placementPolygon({ x: 1, y: 1, w: 2, d: 3, angle: 0 })])).toBeCloseTo(6);
  });

  it('checks bounding-box containment in the room canvas', () => {
    expect(placementWithin({ x: 4.4, y: 0, w: 0.6, d: 1, angle: 0 }, 5, 4)).toBe(true);
    expect(placementWithin({ x: 4.5, y: 0, w: 0.6, d: 1, angle: 0 }, 5, 4)).toBe(false);
  });
});

describe('polygon operations', () => {
  const lShape = union([rectPolygon(0, 0, 6, 3), rectPolygon(0, 3, 3.6, 1.8)]);

  it('measures unions and differences', () => {
    expect(area(lShape)).toBeCloseTo(24.48);
    expect(area(difference(lShape, rectPolygon(5.4, 0, 0.6, 0.6)))).toBeCloseTo(24.12);
  });

  it('treats shared edges as contact, not overlap', () => {
    expect(overlaps(rectPolygon(0, 0, 1, 1), rectPolygon(1, 0, 1, 1))).toBe(false);
    expect(overlaps(rectPolygon(0, 0, 1, 1), rectPolygon(0.9, 0, 1, 1))).toBe(true);
  });

  it('AC03: uses the rotated polygon, not the bounding box, for overlap', () => {
    const stick = placementPolygon({ x: 0, y: 0, w: 0.2, d: 2, angle: 37 });
    const boxInEmptyCorner = rectPolygon(0, 0, 0.2, 0.2);
    expect(overlaps(stick, boxInEmptyCorner)).toBe(false);
  });

  it('checks containment against a region', () => {
    expect(containedIn(rectPolygon(1, 3.5, 1, 1), lShape)).toBe(true);
    expect(containedIn(rectPolygon(4, 3.5, 1, 1), lShape)).toBe(false);
    expect(containedIn(rectPolygon(0, 0, 1, 1), [])).toBe(false);
  });

  it('handles empty inputs', () => {
    expect(union([])).toEqual([]);
    expect(difference([], rectPolygon(0, 0, 1, 1))).toEqual([]);
    expect(area(difference(rectPolygon(0, 0, 1, 1), []))).toBeCloseTo(1);
  });

  it('hit-tests points', () => {
    const p = placementPolygon({ x: 0, y: 0, w: 2, d: 1, angle: 0 });
    expect(pointInPolygon([1, 0.5], p)).toBe(true);
    expect(pointInPolygon([3, 0.5], p)).toBe(false);
  });
});
