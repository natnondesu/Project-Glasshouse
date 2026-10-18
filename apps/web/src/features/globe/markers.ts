import type { GeoPoint } from '@glasshouse/domain';
import type { Level } from './camera';
import { clusterByKey, clusterPoints } from './cluster';

export interface MapSite {
  id: string;
  name: string;
  project: string;
  rooms: number;
  location: GeoPoint;
  sample: boolean;
}

export type Marker =
  | { kind: 'site'; key: string; site: MapSite; x: number; y: number }
  | { kind: 'cluster'; key: string; sites: MapSite[]; x: number; y: number; place: string | null };

export interface Places {
  /** ISO code of the site's country, if it falls in one. */
  country: (siteId: string) => string | null;
  countryName: (code: string) => string;
  /** Name of the site's province, if the map has provinces there. */
  province: (siteId: string) => string | null;
}

/** Pins closer than this merge into a count. */
export const CLUSTER_PX = 40;

function shared<T>(values: T[]): T | null {
  return values.length > 0 && values.every((v) => v === values[0]) ? values[0]! : null;
}

/** The markers on screen: one per country on the world view; closer in, pins that merge when they crowd. */
export function computeMarkers(sites: MapSite[], level: Level, project: (lon: number, lat: number) => [number, number] | null, places: Places): Marker[] {
  const byId = new Map(sites.map((s) => [s.id, s]));
  const points = sites.flatMap((s) => {
    const at = project(s.location.lon, s.location.lat);
    return at ? [{ id: s.id, x: at[0], y: at[1] }] : [];
  });
  const clusters = level === 'world' ? clusterByKey(points, (id) => places.country(id) ?? `site:${id}`) : clusterPoints(points, CLUSTER_PX);
  return clusters.map((c) => {
    const members = c.ids.map((id) => byId.get(id)!);
    if (members.length === 1) return { kind: 'site', key: members[0]!.id, site: members[0]!, x: c.x, y: c.y };
    const country = shared(c.ids.map(places.country));
    const province = level === 'world' ? null : shared(c.ids.map(places.province));
    return { kind: 'cluster', key: c.ids.join('+'), sites: members, x: c.x, y: c.y, place: province ?? (country ? places.countryName(country) : null) };
  });
}
