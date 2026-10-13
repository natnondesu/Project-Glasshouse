import { describe, expect, it } from 'vitest';
import { formatMetres, normalizeAngle, rackAutoHeightM, roundTo, snapDrag, snapFloor, snapTyped } from './units';

describe('units', () => {
  it('rounds without floating-point drift', () => {
    expect(roundTo(0.1 + 0.2, 0.1)).toBe(0.3);
    expect(snapTyped(1.006)).toBe(1.01);
    expect(snapTyped(-0.001)).toBe(0);
  });

  it('snaps floor and drag values to 0.10 m', () => {
    expect(snapFloor(1.04)).toBe(1);
    expect(snapDrag(1.25)).toBe(1.3);
  });

  it('normalises angles into 0–360', () => {
    expect(normalizeAngle(-45)).toBe(315);
    expect(normalizeAngle(405)).toBe(45);
    expect(normalizeAngle(360)).toBe(0);
    expect(normalizeAngle(37.004)).toBe(37);
  });

  it('derives rack height from capacity plus frame allowance', () => {
    expect(rackAutoHeightM(42)).toBe(2.05);
  });

  it('formats metres with two decimals', () => {
    expect(formatMetres(5)).toBe('5.00');
  });
});
