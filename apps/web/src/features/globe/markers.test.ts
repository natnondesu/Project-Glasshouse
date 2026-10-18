import { describe, expect, it } from 'vitest';
import { computeMarkers, type MapSite } from './markers';

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
});
