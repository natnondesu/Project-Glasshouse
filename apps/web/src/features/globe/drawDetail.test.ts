import { describe, expect, it } from 'vitest';
import { LEVEL_PPD } from './camera';
import { placeRankLimit } from './drawDetail';

describe('how many places the map names at a zoom', () => {
  it('names no places on the world view', () => {
    expect(placeRankLimit(4)).toBeLessThan(0);
  });

  it('names only capitals and the biggest cities on a country’s opening frame, more closer in, all at city zoom', () => {
    const limits = [LEVEL_PPD.country, 30, 60, 100, 200, LEVEL_PPD.province, LEVEL_PPD.site].map(placeRankLimit);
    expect(limits[0]).toBe(2);
    expect(limits).toEqual([...limits].sort((a, b) => a - b));
    expect(placeRankLimit(LEVEL_PPD.province)).toBe(10);
  });
});
