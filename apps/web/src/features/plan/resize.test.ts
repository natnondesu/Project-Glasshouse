import { describe, expect, it } from 'vitest';
import { resizePlacement } from './resize';

describe('resizePlacement', () => {
  const square = { x: 1, y: 1, w: 1, d: 1, angle: 0 };

  it('drags the south-east corner', () => {
    expect(resizePlacement(square, 'se', [3, 2.5])).toEqual({ x: 1, y: 1, w: 2, d: 1.5 });
  });

  it('drags the west edge, keeping the east edge fixed', () => {
    expect(resizePlacement(square, 'w', [0.5, 1.5])).toEqual({ x: 0.5, y: 1, w: 1.5, d: 1 });
  });

  it('never collapses below the minimum size', () => {
    expect(resizePlacement(square, 'e', [0, 1.5]).w).toBe(0.1);
  });

  it('follows local axes on a rotated object', () => {
    const rotated = { x: 1, y: 1, w: 1, d: 2, angle: 90 };
    expect(resizePlacement(rotated, 'e', [2, 2.5])).toEqual({ x: 1, y: 1, w: 1.5, d: 2 });
  });
});
