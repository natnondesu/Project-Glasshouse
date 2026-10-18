import { describe, expect, it } from 'vitest';
import countries from './data/countries-50m.topo.json';
import provinces from './data/thailand-provinces-10m.topo.json';
import { parseGeo, regionAt, regionName } from './geoData';

const geo = parseGeo(countries as never, provinces as never);

describe('the shipped outlines', () => {
  it('has every country and all 77 Thai provinces, each with its own Thai name', () => {
    expect(geo.countries.length).toBeGreaterThan(230);
    expect(geo.provinces).toHaveLength(77);
    expect(new Set(geo.provinces.map((p) => p.nameTh)).size).toBe(77);
    expect(new Set(geo.provinces.map((p) => p.code)).size).toBe(77);
  });

  it('finds the country and province of a site', () => {
    expect(regionAt(geo.countries, 100.5135, 13.7208)?.code).toBe('TH');
    expect(regionAt(geo.provinces, 100.5135, 13.7208)?.name).toBe('Bangkok');
    expect(regionAt(geo.countries, 151.2093, -33.8688)?.code).toBe('AU');
    expect(regionAt(geo.provinces, 151.2093, -33.8688)).toBeNull();
    // Mid-ocean is nowhere.
    expect(regionAt(geo.countries, -140, 0)).toBeNull();
  });

  it('names regions in the interface language', () => {
    const bangkok = regionAt(geo.provinces, 100.5135, 13.7208)!;
    expect(regionName(bangkok, 'en')).toBe('Bangkok');
    expect(regionName(bangkok, 'th')).toBe('กรุงเทพมหานคร');
    const thailand = regionAt(geo.countries, 100.5, 13.7)!;
    expect(regionName(thailand, 'en')).toBe('Thailand');
    expect(regionName(thailand, 'th')).toBe('ไทย');
  });

  it('frames regions with boxes, including those across the antimeridian', () => {
    const thailand = geo.countries.find((c) => c.code === 'TH')!;
    const [[w, s], [e, n]] = thailand.box;
    expect([w, s, e, n].map(Math.round)).toEqual([97, 6, 106, 20]);
    // Russia reaches past 180° into Chukotka: its box wraps (west > east).
    const russia = geo.countries.find((c) => c.code === 'RU')!;
    expect(russia.box[0][0]).toBeGreaterThan(russia.box[1][0]);
  });
});
