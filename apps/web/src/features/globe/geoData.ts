import { geoBounds, geoCentroid, geoContains, geoDistance } from 'd3-geo';
import type { Feature, FeatureCollection, Geometry, Point } from 'geojson';
import { feature } from 'topojson-client';
import countriesUrl from './data/countries-50m.topo.json?url';
import seaDetailUrl from './data/sea-detail-10m.topo.json?url';
import provincesUrl from './data/thailand-provinces-10m.topo.json?url';
import worldDetailUrl from './data/world-detail-110m.topo.json?url';
import type { GeoBox } from './camera';
import { placeName } from './regionNames';

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
  /** Degrees from the centroid to the far corner of the box: enough to tell when a region is round the back. */
  radius: number;
}

/** A river (centre line) or a lake: drawn, never labelled; the box lets the drawing skip what is out of view. */
export interface MapShape {
  name: string;
  feature: Feature<Geometry>;
  box: GeoBox;
}

/** A town or city: `rank` is Natural Earth's scalerank (0 is the most important), so fewer show further out. */
export interface MapPlace {
  name: string;
  nameTh: string | null;
  rank: number;
  capital: boolean;
  lon: number;
  lat: number;
}

export interface MapAirport {
  name: string;
  nameTh: string | null;
  iata: string;
  rank: number;
  lon: number;
  lat: number;
}

/** South-East Asia in full detail and the rest of the world coarse, from Natural Earth. */
export interface GeoDetail {
  rivers: MapShape[];
  lakes: MapShape[];
  places: MapPlace[];
  airports: MapAirport[];
}

export interface GeoData {
  countries: Region[];
  provinces: Region[];
  detail: GeoDetail;
}

type Topology = Parameters<typeof feature>[0];
type CountryProps = { n: string; a2: string };
type ProvinceProps = { n: string; t: string; iso: string };

function regions<P extends Record<string, string>>(topology: Topology, object: string, read: (p: P) => Pick<Region, 'code' | 'name' | 'nameTh'>): Region[] {
  const layer = topology.objects[object];
  if (!layer) throw new Error(`The map data has no "${object}" layer.`);
  const collection = feature(topology, layer) as unknown as FeatureCollection<Geometry, P>;
  return collection.features.map((f) => {
    const shape = f as Feature<Geometry>;
    const box = geoBounds(shape) as GeoBox;
    const centroid = geoCentroid(shape);
    const [[w, s], [e, n]] = box;
    const corners: [number, number][] = [[w, s], [w, n], [e, s], [e, n]];
    const radius = Math.max(...corners.map((c) => geoDistance(centroid, c))) * (180 / Math.PI);
    return { ...read(f.properties), feature: shape, box, centroid, radius };
  });
}

async function fetchTopology(url: string): Promise<Topology> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`The map data didn't load (${response.status} for ${url}).`);
  return (await response.json()) as Topology;
}

function collection<P>(topology: Topology, object: string): Feature<Geometry, P>[] {
  const layer = topology.objects[object];
  if (!layer) throw new Error(`The map data has no "${object}" layer.`);
  return (feature(topology, layer) as unknown as FeatureCollection<Geometry, P>).features;
}

const shapes = (topology: Topology, object: string): MapShape[] =>
  collection<{ n?: string }>(topology, object).flatMap((f) => (f.geometry ? [{ name: f.properties?.n ?? '', feature: f as Feature<Geometry>, box: geoBounds(f) as GeoBox }] : []));

const points = <P>(topology: Topology, object: string): { p: P; lon: number; lat: number }[] =>
  collection<P>(topology, object).flatMap((f) => (f.geometry?.type === 'Point' ? [{ p: f.properties, lon: (f.geometry as Point).coordinates[0]!, lat: (f.geometry as Point).coordinates[1]! }] : []));

export function parseDetail(...topologies: Topology[]): GeoDetail {
  return {
    rivers: topologies.flatMap((t) => shapes(t, 'rivers')),
    lakes: topologies.flatMap((t) => shapes(t, 'lakes')),
    places: topologies
      .flatMap((t) => points<{ n: string; t?: string; r: number; c: number }>(t, 'places'))
      .map(({ p, lon, lat }) => ({ name: p.n, nameTh: p.t ?? null, rank: p.r, capital: p.c === 1, lon, lat }))
      // Most important first, so the labels that collide are the minor ones.
      .sort((a, b) => Number(b.capital) - Number(a.capital) || a.rank - b.rank),
    airports: topologies
      .flatMap((t) => points<{ n: string; t?: string; iata: string; r: number }>(t, 'airports'))
      .map(({ p, lon, lat }) => ({ name: p.n, nameTh: p.t ?? null, iata: p.iata, rank: p.r, lon, lat }))
      .sort((a, b) => a.rank - b.rank),
  };
}

const NO_DETAIL: GeoDetail = { rivers: [], lakes: [], places: [], airports: [] };

export function parseGeo(countries: Topology, provinces: Topology, ...detail: Topology[]): GeoData {
  return {
    countries: regions<CountryProps>(countries, 'countries', (p) => ({ code: /^[A-Z]{2}$/.test(p.a2) ? p.a2 : null, name: p.n, nameTh: null })),
    provinces: regions<ProvinceProps>(provinces, 'provinces', (p) => ({ code: p.iso || null, name: p.n, nameTh: p.t || null })),
    detail: detail.length > 0 ? parseDetail(...detail) : NO_DETAIL,
  };
}

let pending: Promise<GeoData> | null = null;

/** The outlines, fetched once per page from Glasshouse itself (no outside requests). A failure can be retried. */
export function loadGeo(): Promise<GeoData> {
  pending ??= Promise.all([fetchTopology(countriesUrl), fetchTopology(provincesUrl), fetchTopology(seaDetailUrl), fetchTopology(worldDetailUrl)])
    .then(([c, p, sea, world]) => parseGeo(c, p, sea, world))
    .catch((error: unknown) => {
      pending = null;
      throw error;
    });
  return pending;
}

const inBox = ([[w, s], [e, n]]: GeoBox, lon: number, lat: number): boolean => lat >= s && lat <= n && (e >= w ? lon >= w && lon <= e : lon >= w || lon <= e);

/** The region a point falls in, if any (its box first, so only a few outlines are tested). */
export const regionAt = (list: Region[], lon: number, lat: number): Region | null => list.find((r) => inBox(r.box, lon, lat) && geoContains(r.feature, [lon, lat])) ?? null;

/** A region's name in the interface language: provinces carry Thai in the data; countries use the browser's own names. */
export const regionName = (region: Region, lang: 'en' | 'th'): string => placeName(region, lang);

/** A place or airport's name in the interface language: Thai from the checked name table where it has one. */
export const pointName = (point: { name: string; nameTh: string | null }, lang: 'en' | 'th'): string => (lang === 'th' && point.nameTh ? point.nameTh : point.name);
