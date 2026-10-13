import { createObject, emptyContent, footprintOf, type PlanContent } from '@glasshouse/domain';
import { describe, expect, it } from 'vitest';
import { measureBetween, snapMeasurePoint, wallGaps } from './measure';

const room = (): PlanContent => {
  const c = emptyContent();
  const rack = { ...createObject('rack', { x: 1, y: 0.6 }, []), name: 'RK-01' };
  return { ...c, objects: [rack] };
};

describe('measureBetween', () => {
  it('gives the straight distance and both axis components', () => {
    expect(measureBetween([0, 0], [3, 4])).toEqual({ distance: 5, dx: 3, dy: 4 });
  });
});

describe('snapMeasurePoint', () => {
  it('snaps to a wall corner first', () => {
    expect(snapMeasurePoint([0.03, 0.02], room(), 0.1)).toMatchObject({ point: [0, 0], kind: 'corner', label: 'Wall corner' });
  });

  it('snaps onto a wall edge', () => {
    const s = snapMeasurePoint([0.04, 1.5], room(), 0.1);
    expect(s.kind).toBe('edge');
    expect(s.label).toBe('Wall');
    expect(s.point[0]).toBeCloseTo(0);
    expect(s.point[1]).toBeCloseTo(1.5);
  });

  it('snaps onto an object edge with its name', () => {
    const s = snapMeasurePoint([0.96, 1.2], room(), 0.1);
    expect(s).toMatchObject({ kind: 'edge', label: 'RK-01' });
    expect(s.point[0]).toBeCloseTo(1);
  });

  it('stays free away from anything, rounded to 1 cm', () => {
    expect(snapMeasurePoint([2.5037, 2.5021], room(), 0.1)).toEqual({ point: [2.5, 2.5], kind: 'free', label: null });
  });
});

describe('wallGaps', () => {
  it('measures from an object to the nearest wall on each side', () => {
    const c = room();
    const gaps = wallGaps(c.objects[0]!, footprintOf(c.survey));
    const bySide = Object.fromEntries(gaps.map((g) => [g.side, Number(g.distance.toFixed(2))]));
    expect(bySide).toEqual({ left: 1, right: 3.4, top: 0.6, bottom: 2.33 });
  });

  it('treats a column cut-out as a wall', () => {
    const c = room();
    const survey = { ...c.survey, cutOuts: [{ id: 'col', x: 2.4, y: 0.8, w: 0.4, d: 0.4 }] };
    const right = wallGaps(c.objects[0]!, footprintOf(survey)).find((g) => g.side === 'right');
    expect(right?.distance).toBeCloseTo(0.8);
  });
});
