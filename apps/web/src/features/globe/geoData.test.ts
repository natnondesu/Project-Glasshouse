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
    // Places outside Thailand are named in Thai too.
    expect(pointName(place('Sydney'), 'th')).toBe('ซิดนีย์');
    expect(pointName(place('Sydney'), 'en')).toBe('Sydney');
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

describe('Thai on the map', () => {
  const latin = /[A-Za-z]/;

  it('has a Thai name for every place and airport the map can show, never a Latin fallback', () => {
    const { places, airports } = geo.detail;
    expect(places.length).toBeGreaterThan(700);
    expect(places.filter((p) => !p.nameTh || latin.test(p.nameTh)).map((p) => p.name)).toEqual([]);
    expect(airports.filter((a) => !a.nameTh || latin.test(a.nameTh)).map((a) => a.iata)).toEqual([]);
  });

  it('names every country in Thai, those without a code too', () => {
    expect(geo.countries.filter((c) => latin.test(regionName(c, 'th'))).map((c) => c.name)).toEqual([]);
    expect(regionName(geo.countries.find((c) => c.name === 'Taiwan')!, 'th')).toBe('ไต้หวัน');
  });

  it('keeps the checked names and the usual forms of the region’s cities', () => {
    const th = (name: string) => pointName(geo.detail.places.find((p) => p.name === name)!, 'th');
    expect(th('Bangkok')).toBe('กรุงเทพมหานคร');
    expect(th('Suphan Buri')).toBe('สุพรรณบุรี');
    expect(th('Hanoi')).toBe('ฮานอย');
    expect(th('Yangon')).toBe('ย่างกุ้ง');
    expect(th('Vientiane')).toBe('เวียงจันทน์');
    expect(th('Phnom Penh')).toBe('พนมเปญ');
    expect(th('Hong Kong')).toBe('ฮ่องกง');
    expect(th('Kolkata')).toBe('โกลกาตา');
    expect(th('Chattogram')).toBe('จิตตะกอง');
    expect(th('Nanning')).toBe('หนานหนิง');
    // Wikidata's administrative prefixes are dropped from map labels.
    expect(th('Batu Pahat')).toBe('บาตูปาฮัต');
  });
});
