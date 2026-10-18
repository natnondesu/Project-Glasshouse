import { describe, expect, it } from 'vitest';
import { computeMarkers, markerGroups, markersFrom, splitsAt, type MapSite } from './markers';

const site = (id: string, lon: number, lat: number): MapSite => ({ id, name: id, project: 'P', rooms: 1, location: { lat, lon }, sample: false });
// A flat stand-in for the projection: 10 px a degree, the far side hidden past 90° east.
const project = (lon: number, lat: number): [number, number] | null => (lon > 90 ? null : [lon * 10, -lat * 10]);
const regions = { a: 'TH', b: 'TH', c: 'TH', d: 'AU' } as Record<string, string>;
const place = { country: (id: string) => regions[id] ?? null, countryName: (code: string) => (code === 'TH' ? 'Thailand' : 'Australia'), province: () => null };

describe('computeMarkers', () => {
  const sites = [site('a', 10, 0), site('b', 10.5, 0), site('c', 30, 0), site('d', 80, -30)];

  it('makes one marker per country on the world view, named after it', () => {
    const markers = computeMarkers(sites, 'world', project, place);
    expect(markers.map((m) => (m.kind === 'cluster' ? `${m.place}:${m.sites.length}` : m.site.id))).toEqual(['Thailand:3', 'd']);
  });

  it('clusters by distance on screen closer in, and leaves single sites as pins', () => {
    const markers = computeMarkers(sites, 'country', project, place);
    expect(markers.map((m) => (m.kind === 'cluster' ? m.sites.map((s) => s.id).join('+') : m.site.id))).toEqual(['a+b', 'c', 'd']);
  });

  it('leaves out sites on the far side of the globe', () => {
    expect(computeMarkers([site('far', 120, 0)], 'country', project, place)).toEqual([]);
  });

  it('names a cluster after the province its sites share, else the country, else nothing', () => {
    const shared = { ...place, province: () => 'Bangkok' };
    const [m] = computeMarkers([site('a', 10, 0), site('b', 10.5, 0)], 'province', project, shared);
    expect(m).toMatchObject({ kind: 'cluster', place: 'Bangkok' });
    const [n] = computeMarkers([site('a', 10, 0), site('d', 10.5, 0)], 'province', project, place);
    expect(n).toMatchObject({ kind: 'cluster', place: null });
  });

  it('says which region a count stands for, so picking it can scope to that place', () => {
    const [world] = computeMarkers([site('a', 10, 0), site('b', 10.5, 0)], 'world', project, place);
    expect(world).toMatchObject({ kind: 'cluster', region: { level: 'country', code: 'TH' } });
    const bangkok = { ...place, province: () => 'Bangkok', provinceCode: () => 'TH-10' };
    const [m] = computeMarkers([site('a', 10, 0), site('b', 10.5, 0)], 'province', project, bangkok);
    expect(m).toMatchObject({ region: { level: 'province', code: 'TH-10' } });
    const [n] = computeMarkers([site('a', 10, 0), site('d', 10.5, 0)], 'province', project, place);
    expect(n).toMatchObject({ region: null });
  });
});

describe('grouping kept per zoom step', () => {
  it('keeps the groups and moves the markers with the view', () => {
    const sites = [site('a', 10, 0), site('b', 10.5, 0), site('c', 30, 0)];
    const groups = markerGroups(sites, 'country', project, place);
    expect(groups).toEqual([['a', 'b'], ['c']]);
    const panned = (lon: number, lat: number): [number, number] | null => [lon * 10 + 50, -lat * 10];
    expect(markersFrom(groups, sites, 'country', panned, place).map((m) => [m.key, m.x])).toEqual([['a+b', 152.5], ['c', 350]]);
  });

  it('drops members that went off screen, and a group with none left', () => {
    const sites = [site('a', 10, 0), site('far', 120, 0)];
    expect(markersFrom([['a', 'far']], sites, 'country', project, place)).toMatchObject([{ kind: 'site', key: 'a' }]);
    expect(markersFrom([['far']], sites, 'country', project, place)).toEqual([]);
  });
});

describe('splitsAt', () => {
  it('knows when zooming in can no longer pull two sites apart', () => {
    const near = [site('a', 98.9853, 18.7883), site('b', 98.9855, 18.7887)];
    expect(splitsAt(near, 30000)).toBe(false);
    const apart = [site('a', 100.5135, 13.7208), site('b', 100.51, 13.739)];
    expect(splitsAt(apart, 4000)).toBe(true);
    expect(splitsAt(apart, 500)).toBe(false);
  });
});
