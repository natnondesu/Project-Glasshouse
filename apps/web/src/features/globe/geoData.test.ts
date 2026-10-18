import { describe, expect, it } from 'vitest';
import countries from './data/countries-50m.topo.json';
import seaDetail from './data/sea-detail-10m.topo.json';
import provinces from './data/thailand-provinces-10m.topo.json';
import worldDetail from './data/world-detail-110m.topo.json';
import { parseGeo, pointName, regionAt, regionName } from './geoData';

const geo = parseGeo(countries as never, provinces as never, seaDetail as never, worldDetail as never);

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

describe('the map detail', () => {
  const { places, airports, rivers, lakes } = geo.detail;
  const place = (name: string) => places.find((p) => p.name === name)!;

  it('has the rivers and lakes of South-East Asia, and coarse ones elsewhere', () => {
    const names = new Set(rivers.map((r) => r.name));
    for (const river of ['Chao Phraya', 'Mekong', 'Ping', 'Yom']) expect(names).toContain(river);
    expect(lakes.map((l) => l.name)).toContain('Tonlé Sap');
    // Coarse world rivers: the Amazon is far outside the detailed box.
    expect(names).toContain('Amazonas');
  });

  it('names Thai places from the checked table, and Bangkok is Bangkok', () => {
    const bangkok = place('Bangkok');
    expect(bangkok).toMatchObject({ capital: true, nameTh: 'กรุงเทพมหานคร' });
    expect(bangkok.lat).toBeCloseTo(13.75, 1);
    expect(bangkok.lon).toBeCloseTo(100.52, 1);
    expect(pointName(bangkok, 'th')).toBe('กรุงเทพมหานคร');
    expect(pointName(place('Chiang Mai'), 'th')).toBe('เชียงใหม่');
    expect(pointName(place('Hat Yai'), 'th')).toBe('หาดใหญ่');
    // Natural Earth's misspelling is corrected.
    expect(place('Suphan Buri').nameTh).toBe('สุพรรณบุรี');
    // A place without a Thai name keeps its English one in Thai.
    expect(pointName(place('Sydney'), 'th')).toBe('Sydney');
  });

  it('lists capitals first, then by importance, so minor names give way', () => {
    expect(places[0]!.capital).toBe(true);
    const ranks = places.filter((p) => !p.capital).map((p) => p.rank);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  });

  it('has Bangkok’s two airports under their own names, in Thai too', () => {
    const bkk = airports.find((a) => a.iata === 'BKK')!;
    const dmk = airports.find((a) => a.iata === 'DMK')!;
    expect([bkk.name, bkk.nameTh]).toEqual(['Suvarnabhumi', 'สุวรรณภูมิ']);
    expect([dmk.name, dmk.nameTh]).toEqual(['Don Mueang', 'ดอนเมือง']);
    expect(bkk.lon).toBeCloseTo(100.75, 1);
    expect(dmk.lat).toBeCloseTo(13.92, 1);
  });
});
