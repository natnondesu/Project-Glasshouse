import { describe, expect, it } from 'vitest';
import { clusterByKey, clusterPoints } from './cluster';

const p = (id: string, x: number, y: number) => ({ id, x, y });

describe('clusterPoints', () => {
  it('keeps points apart that are 40 px or more from each other', () => {
    expect(clusterPoints([p('a', 0, 0), p('b', 40, 0), p('c', 0, 100)], 40).map((c) => c.ids)).toEqual([['a'], ['b'], ['c']]);
  });

  it('merges points closer than the radius into one marker at their centre', () => {
    expect(clusterPoints([p('a', 0, 0), p('b', 30, 0), p('c', 300, 300)], 40)).toEqual([
      { ids: ['a', 'b'], x: 15, y: 0 },
      { ids: ['c'], x: 300, y: 300 },
    ]);
  });

  it('chains: a third point near the merged centre joins it', () => {
    // a–b (20) merge first, centre 10; c is then 35 from it.
    const clusters = clusterPoints([p('a', 0, 0), p('b', 20, 0), p('c', 45, 0)], 40);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]!.ids).toEqual(['a', 'b', 'c']);
    expect(clusters[0]!.x).toBeCloseTo(65 / 3);
  });

  it('merges the closest pair first, so a far point stays out', () => {
    // b–c are 10 apart, a–b 35: b and c merge (centre 40), then a is 40 from that centre and stays alone.
    expect(clusterPoints([p('a', 0, 0), p('b', 35, 0), p('c', 45, 0)], 40).map((c) => c.ids)).toEqual([['a'], ['b', 'c']]);
  });

  it('splits as the map zooms in (the same sites, spread further apart)', () => {
    const at = (scale: number) => clusterPoints([p('campus', 0, 0), p('annex', 2 * scale, 1 * scale), p('bangna', 13 * scale, 6 * scale)], 40).length;
    expect([at(1), at(5), at(30)]).toEqual([1, 2, 3]);
  });

  it('keeps sites at the very same spot together at any zoom', () => {
    expect(clusterPoints([p('a', 5, 5), p('b', 5, 5)], 40)).toEqual([{ ids: ['a', 'b'], x: 5, y: 5 }]);
  });

  it('answers nothing for nothing', () => {
    expect(clusterPoints([], 40)).toEqual([]);
  });
});

describe('clusterByKey', () => {
  it('makes one marker per country at the centre of its visible sites, in first-seen order', () => {
    const points = [p('a', 0, 0), p('b', 10, 20), p('c', 500, 0)];
    const country = { a: 'TH', b: 'TH', c: 'AU' } as Record<string, string>;
    expect(clusterByKey(points, (id) => country[id]!)).toEqual([
      { ids: ['a', 'b'], x: 5, y: 10, key: 'TH' },
      { ids: ['c'], x: 500, y: 0, key: 'AU' },
    ]);
  });
});
