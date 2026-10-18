import { describe, expect, it } from 'vitest';
import { intersects, markerBox, placePointLabel, type Rect } from './labels';
import type { MapSite, Marker } from './markers';

const SIZE = { width: 800, height: 500 };
const site: MapSite = { id: 's', name: 'Bangna campus', project: 'P', rooms: 2, location: { lat: 0, lon: 0 }, sample: false };

describe('a point label (a city or an airport)', () => {
  it('sits to the right of its dot when there is room', () => {
    const rect = placePointLabel({ x: 100, y: 100, width: 60, height: 14, gap: 6 }, [], [], SIZE);
    expect(rect).not.toBeNull();
    expect(rect!.x).toBeGreaterThan(100);
  });

  it('moves to the left when a pin’s label is to the right', () => {
    const pinLabel: Rect = { x: 110, y: 85, w: 200, h: 30 };
    const rect = placePointLabel({ x: 100, y: 100, width: 60, height: 14, gap: 6 }, [], [pinLabel], SIZE);
    expect(rect!.x + rect!.w).toBeLessThan(100);
    expect(intersects(rect!, pinLabel)).toBe(false);
  });

  it('goes above or below when both sides are taken, and gives way when nothing is free', () => {
    const left: Rect = { x: 0, y: 95, w: 98, h: 10 };
    const right: Rect = { x: 102, y: 95, w: 300, h: 10 };
    const rect = placePointLabel({ x: 100, y: 100, width: 60, height: 14, gap: 6 }, [left], [right], SIZE);
    expect(rect).not.toBeNull();
    expect(intersects(rect!, left) || intersects(rect!, right)).toBe(false);
    const everywhere: Rect = { x: 0, y: 0, w: 800, h: 500 };
    expect(placePointLabel({ x: 100, y: 100, width: 60, height: 14, gap: 6 }, [], [everywhere], SIZE)).toBeNull();
  });

  it('never runs off the canvas or over a label already placed', () => {
    const atEdge = placePointLabel({ x: 790, y: 100, width: 60, height: 14, gap: 6 }, [], [], SIZE);
    expect(atEdge!.x + atEdge!.w).toBeLessThanOrEqual(SIZE.width);
    const city: Rect = { x: 104, y: 92, w: 80, h: 18 };
    const next = placePointLabel({ x: 100, y: 100, width: 60, height: 14, gap: 6 }, [city], [], SIZE);
    expect(next && intersects(next, city)).toBeFalsy();
  });
});

describe('the space a marker keeps clear', () => {
  it('covers the pin and its name, on the side the name is drawn', () => {
    const right: Marker = { kind: 'site', key: 's', site, x: 200, y: 200 };
    const box = markerBox(right, SIZE.width);
    expect(box.x).toBeLessThan(200 - 12);
    expect(box.x + box.w).toBeGreaterThan(200 + 150);
    // Near the right edge the name flips to the left of the pin.
    const flipped = markerBox({ ...right, x: 750 }, SIZE.width);
    expect(flipped.x).toBeLessThan(750 - 150);
    expect(flipped.x + flipped.w).toBeGreaterThan(750 + 12);
  });
});
