import { geoBounds, geoCentroid, geoContains } from 'd3-geo';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import { feature } from 'topojson-client';
import countriesUrl from './data/countries-50m.topo.json?url';
import provincesUrl from './data/thailand-provinces-10m.topo.json?url';
import type { GeoBox } from './camera';

export interface Region {
  /** ISO code: alpha-2 for a country, 3166-2 for a province. Null for a few disputed areas without one. */
  code: string | null;
  /** English name from the data. */
  name: string;
  /** Thai name when the data has one (provinces); countries take theirs from the browser. */
  nameTh: string | null;
  feature: Feature<Geometry>;
  box: GeoBox;
  centroid: [number, number];
}

export interface GeoData {
  countries: Region[];
  provinces: Region[];
}

type Topology = Parameters<typeof feature>[0];
type CountryProps = { n: string; a2: string };
type ProvinceProps = { n: string; t: string; iso: string };

function regions<P extends Record<string, string>>(topology: Topology, object: string, read: (p: P) => Pick<Region, 'code' | 'name' | 'nameTh'>): Region[] {
  const layer = topology.objects[object];
  if (!layer) throw new Error(`The map data has no "${object}" layer.`);
  const collection = feature(topology, layer) as unknown as FeatureCollection<Geometry, P>;
  return collection.features.map((f) => ({ ...read(f.properties), feature: f as Feature<Geometry>, box: geoBounds(f as Feature<Geometry>) as GeoBox, centroid: geoCentroid(f as Feature<Geometry>) }));
}

async function fetchTopology(url: string): Promise<Topology> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`The map data didn't load (${response.status} for ${url}).`);
  return (await response.json()) as Topology;
}

export function parseGeo(countries: Topology, provinces: Topology): GeoData {
  return {
    countries: regions<CountryProps>(countries, 'countries', (p) => ({ code: /^[A-Z]{2}$/.test(p.a2) ? p.a2 : null, name: p.n, nameTh: null })),
    provinces: regions<ProvinceProps>(provinces, 'provinces', (p) => ({ code: p.iso || null, name: p.n, nameTh: p.t || null })),
  };
}

let pending: Promise<GeoData> | null = null;

/** The outlines, fetched once per page from Glasshouse itself (no outside requests). A failure can be retried. */
export function loadGeo(): Promise<GeoData> {
  pending ??= Promise.all([fetchTopology(countriesUrl), fetchTopology(provincesUrl)])
    .then(([c, p]) => parseGeo(c, p))
    .catch((error: unknown) => {
      pending = null;
      throw error;
    });
  return pending;
}

const inBox = ([[w, s], [e, n]]: GeoBox, lon: number, lat: number): boolean => lat >= s && lat <= n && (e >= w ? lon >= w && lon <= e : lon >= w || lon <= e);

/** The region a point falls in, if any (its box first, so only a few outlines are tested). */
export const regionAt = (list: Region[], lon: number, lat: number): Region | null => list.find((r) => inBox(r.box, lon, lat) && geoContains(r.feature, [lon, lat])) ?? null;

const displayNames = new Map<string, Intl.DisplayNames | null>();

/** A region's name in the interface language: provinces carry Thai in the data; countries use the browser's own names. */
export function regionName(region: Region, lang: 'en' | 'th'): string {
  if (region.nameTh !== null) return lang === 'th' ? region.nameTh : region.name;
  if (!region.code) return region.name;
  if (!displayNames.has(lang)) {
    try {
      displayNames.set(lang, new Intl.DisplayNames([lang], { type: 'region', fallback: 'none' }));
    } catch {
      displayNames.set(lang, null);
    }
  }
  return displayNames.get(lang)?.of(region.code) ?? region.name;
}
