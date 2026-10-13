import { describe, expect, it } from 'vitest';
import { fit, MAX_SCALE, pan, toScreen, toWorld, wheelZoomFactor, zoomAt } from './math';

describe('viewport math', () => {
  const view = { scale: 100, tx: 50, ty: 20 };

  it('converts between world and screen', () => {
    expect(toScreen(view, [1, 2])).toEqual([150, 220]);
    expect(toWorld(view, [150, 220])).toEqual([1, 2]);
  });

  it('keeps the world point under the pointer while zooming', () => {
    const before = toWorld(view, [300, 200]);
    const zoomed = zoomAt(view, 1.8, 300, 200);
    const after = toWorld(zoomed, [300, 200]);
    expect(after[0]).toBeCloseTo(before[0]);
    expect(after[1]).toBeCloseTo(before[1]);
    expect(zoomed.scale).toBeCloseTo(180);
  });

  it('clamps zoom', () => {
    expect(zoomAt(view, 1000, 0, 0).scale).toBe(MAX_SCALE);
  });

  it('pans and fits content centred with padding', () => {
    expect(pan(view, 10, -5)).toEqual({ scale: 100, tx: 60, ty: 15 });
    const f = fit({ w: 5, d: 4 }, { width: 1000, height: 700 }, 64);
    expect(f.scale).toBeCloseTo(143);
    expect(f.tx).toBeCloseTo((1000 - 5 * 143) / 2);
  });

  it('turns wheel deltas into zoom factors', () => {
    expect(wheelZoomFactor(-100, 0)).toBeGreaterThan(1);
    expect(wheelZoomFactor(3, 1)).toBeLessThan(1);
  });
});

describe('fit with insets', () => {
  it('reserves room for the floating tool palette on the left', () => {
    const f = fit({ w: 5, d: 4 }, { width: 1000, height: 700 }, { top: 64, right: 64, bottom: 64, left: 120 });
    expect(f.tx).toBeGreaterThanOrEqual(120);
    expect(f.tx + 5 * f.scale).toBeLessThanOrEqual(1000 - 64 + 1e-9);
  });
});
