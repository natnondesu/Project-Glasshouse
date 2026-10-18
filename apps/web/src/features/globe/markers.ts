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
  | { kind: 'cluster'; key: string; sites: MapSite[]; x: number; y: number; place: string | null; region: ClusterRegion | null };

/** The province (closer in) or country its sites share: picking the count scopes Home to that place. */
export interface ClusterRegion {
  level: 'country' | 'province';
  code: string;
}

export interface Places {
  /** ISO code of the site's country, if it falls in one. */
  country: (siteId: string) => string | null;
  countryName: (code: string) => string;
  /** Name of the site's province, if the map has provinces there. */
  province: (siteId: string) => string | null;
  /** ISO 3166-2 code of the site's province, if the map has provinces there. */
  provinceCode?: (siteId: string) => string | null;
}

/** Pins closer than this merge into a count. */
export const CLUSTER_PX = 40;

function shared<T>(values: T[]): T | null {
  return values.length > 0 && values.every((v) => v === values[0]) ? values[0]! : null;
}

type Project = (lon: number, lat: number) => [number, number] | null;

/**
 * Which sites share a marker: one per country on the world view; closer in, pins that merge when they crowd. Only the
 * zoom changes this (panning keeps distances on screen), so callers can keep it per zoom step instead of per frame.
 */
export function markerGroups(sites: MapSite[], level: Level, project: Project, places: Places): string[][] {
  const points = sites.flatMap((s) => {
    const at = project(s.location.lon, s.location.lat);
    return at ? [{ id: s.id, x: at[0], y: at[1] }] : [];
  });
  const clusters = level === 'world' ? clusterByKey(points, (id) => places.country(id) ?? `site:${id}`) : clusterPoints(points, CLUSTER_PX);
  return clusters.map((c) => c.ids);
}

/** The markers for this frame: each group at the centre of its members on screen now. */
export function markersFrom(groups: string[][], sites: MapSite[], level: Level, project: Project, places: Places): Marker[] {
  const byId = new Map(sites.map((s) => [s.id, s]));
  return groups.flatMap((ids): Marker[] => {
    const members = ids.flatMap((id) => {
      const site = byId.get(id);
      const at = site ? project(site.location.lon, site.location.lat) : null;
      return site && at ? [{ site, at }] : [];
    });
    if (members.length === 0) return [];
    const x = members.reduce((n, m) => n + m.at[0], 0) / members.length;
    const y = members.reduce((n, m) => n + m.at[1], 0) / members.length;
    if (members.length === 1) return [{ kind: 'site', key: members[0]!.site.id, site: members[0]!.site, x, y }];
    const memberIds = members.map((m) => m.site.id);
    const country = shared(memberIds.map(places.country));
    const province = level === 'world' ? null : shared(memberIds.map(places.province));
    const provinceCode = level === 'world' || !places.provinceCode ? null : shared(memberIds.map(places.provinceCode));
    const region: ClusterRegion | null = provinceCode ? { level: 'province', code: provinceCode } : country ? { level: 'country', code: country } : null;
    return [{ kind: 'cluster', key: memberIds.join('+'), sites: members.map((m) => m.site), x, y, place: province ?? (country ? places.countryName(country) : null), region }];
  });
}

/** The markers on screen, grouped and placed in one go. */
export function computeMarkers(sites: MapSite[], level: Level, project: Project, places: Places): Marker[] {
  return markersFrom(markerGroups(sites, level, project, places), sites, level, project, places);
}

/** Whether these sites would stand apart at `ppd` (pixels a degree), so zooming in can split their count. */
export function splitsAt(sites: MapSite[], ppd: number): boolean {
  const lat0 = sites.reduce((n, s) => n + s.location.lat, 0) / Math.max(1, sites.length);
  const cos = Math.cos((lat0 * Math.PI) / 180);
  const points = sites.map((s) => ({ id: s.id, x: s.location.lon * cos * ppd, y: -s.location.lat * ppd }));
  return clusterPoints(points, CLUSTER_PX).length > 1;
}
