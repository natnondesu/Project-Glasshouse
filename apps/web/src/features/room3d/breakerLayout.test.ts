import { expect, it } from 'vitest';
import { breakerLayout } from './breakerLayout';
import type { Panel3D } from './scene';

const panel = (columns: number, rows: number, patch: Partial<Panel3D> = {}): Panel3D => ({
  inUse: true,
  columns,
  rows,
  cells: Array.from({ length: columns * rows }, (_, i) => ({ way: i + 1, column: i % columns, row: Math.floor(i / columns), fed: false })),
  ...patch,
});

it('puts way 2 of a two-column panel to the right of way 1 and level with it', () => {
  const { ways } = breakerLayout(panel(2, 3), 0.5, 0.8);
  expect(ways[1]!.x).toBeGreaterThan(ways[0]!.x);
  expect(ways[1]!.y).toBeCloseTo(ways[0]!.y);
  expect(ways[2]!.y).toBeLessThan(ways[0]!.y);
});

it('keeps every breaker inside the cabinet face without overlapping its neighbours', () => {
  for (const [c, r] of [[12, 1], [1, 12], [2, 36], [2, 7]] as const) {
    const { ways } = breakerLayout(panel(c, r), 0.5, 0.8);
    for (const b of ways) {
      expect(Math.abs(b.x) + b.w / 2).toBeLessThanOrEqual(0.25);
      expect(Math.abs(b.y) + b.h / 2).toBeLessThanOrEqual(0.4);
    }
    const spacingX = c > 1 ? Math.abs(ways[1]!.x - ways[0]!.x) : Infinity;
    const spacingY = r > 1 ? Math.abs(ways[c]!.y - ways[0]!.y) : Infinity;
    expect(ways[0]!.w).toBeLessThan(spacingX);
    expect(ways[0]!.h).toBeLessThan(spacingY);
  }
});

it('puts the main breaker above the ways when one is set, and none otherwise', () => {
  expect(breakerLayout(panel(2, 3), 0.5, 0.8).main).toBeNull();
  const withMain = breakerLayout(panel(2, 3, { mainRatingA: 100 }), 0.5, 0.8);
  const top = Math.max(...withMain.ways.map((b) => b.y + b.h / 2));
  expect(withMain.main!.y - withMain.main!.h / 2).toBeGreaterThan(top);
  expect(withMain.main!.x).toBe(0);
});

it('carries which ways are fed', () => {
  const p = panel(2, 1);
  p.cells[1] = { ...p.cells[1]!, fed: true };
  expect(breakerLayout(p, 0.5, 0.8).ways.map((b) => b.fed)).toEqual([false, true]);
});
