import type { GeoPoint } from '@glasshouse/domain';

/** Where the map looks and how close: the centre, and screen pixels per degree of arc there. */
export interface Camera {
  lon: number;
  lat: number;
  ppd: number;
}

export interface Size {
  width: number;
  height: number;
}

/** [[west, south], [east, north]] in degrees; west > east when the box crosses the antimeridian. */
export type GeoBox = [[number, number], [number, number]];

export type Level = 'world' | 'country' | 'province' | 'site';

/** Zoom thresholds: a country (Thailand ~28 px/°), a province or city (Bangkok ~1000 px/°), a site (~30 m a pixel). */
export const LEVEL_PPD = { country: 12, province: 250, site: 3000 } as const;
/** About 4 m a pixel: closer than the outlines are drawn, but enough to set a pin on a campus. */
export const MAX_PPD = 30000;
/** The authored moment: one flight, one ease. */
export const FLIGHT_MS = 1400;
const GLOBE_FILL = 0.44;
const MAX_LAT = 85;
const RAD = Math.PI / 180;

export const levelOf = (ppd: number): Level =>
  ppd >= LEVEL_PPD.site ? 'site' : ppd >= LEVEL_PPD.province ? 'province' : ppd >= LEVEL_PPD.country ? 'country' : 'world';

/** The whole globe, its diameter 88% of the shorter side. */
export function worldCamera(size: Size, centre: GeoPoint = { lat: 12, lon: 100 }): Camera {
  return { lon: centre.lon, lat: centre.lat, ppd: GLOBE_FILL * Math.min(size.width, size.height) * RAD };
}

const wrapLon = (lon: number): number => ((((lon + 180) % 360) + 360) % 360) - 180;

export function clampCamera(cam: Camera, size: Size): Camera {
  const min = worldCamera(size).ppd;
  return { lon: wrapLon(cam.lon), lat: Math.max(-MAX_LAT, Math.min(MAX_LAT, cam.lat)), ppd: Math.max(min, Math.min(MAX_PPD, cam.ppd)) };
}

/** The smallest box around the points, going the short way round in longitude. */
export function boxOfPoints(points: readonly GeoPoint[]): GeoBox {
  const lats = points.map((p) => p.lat);
  const lons = [...new Set(points.map((p) => p.lon))].sort((a, b) => a - b);
  // The widest gap between neighbouring longitudes (wrapping) is the part of the globe the box leaves out.
  let gap = -1;
  let west = lons[0]!;
  let east = lons[lons.length - 1]!;
  lons.forEach((lon, i) => {
    const next = i + 1 < lons.length ? lons[i + 1]! : lons[0]! + 360;
    if (next - lon > gap) {
      gap = next - lon;
      west = wrapLon(next);
      east = lon;
    }
  });
  if (lons.length === 1) [west, east] = [lons[0]!, lons[0]!];
  return [[west, Math.min(...lats)], [east, Math.max(...lats)]];
}

/** Frames a box with `padding` pixels around it, never closer than `maxPpd` and never further than the world view. */
export function fitBox(box: GeoBox, size: Size, { padding = 48, maxPpd = MAX_PPD }: { padding?: number; maxPpd?: number } = {}): Camera {
  const [[west, south], [east, north]] = box;
  const spanLon = east >= west ? east - west : east + 360 - west;
  const lat = (south + north) / 2;
  const lon = wrapLon(west + spanLon / 2);
  const width = Math.max(1, size.width - 2 * padding);
  const height = Math.max(1, size.height - 2 * padding);
  const byWidth = spanLon > 0 ? width / (spanLon * Math.cos(lat * RAD)) : Infinity;
  const byHeight = north > south ? height / (north - south) : Infinity;
  const ppd = Math.min(byWidth, byHeight, maxPpd);
  return clampCamera({ lon, lat, ppd }, size);
}

/** Zooms by `factor`, keeping the spot under `at` (screen pixels) where it is. */
export function zoomAround(cam: Camera, factor: number, at: { x: number; y: number }, size: Size): Camera {
  const next = clampCamera({ ...cam, ppd: cam.ppd * factor }, size);
  const dx = at.x - size.width / 2;
  const dy = at.y - size.height / 2;
  const cos = Math.max(0.05, Math.cos(cam.lat * RAD));
  const spot = { lon: cam.lon + dx / (cam.ppd * cos), lat: cam.lat - dy / cam.ppd };
  return clampCamera({ lon: spot.lon - dx / (next.ppd * cos), lat: spot.lat + dy / next.ppd, ppd: next.ppd }, size);
}

const easeInOutCubic = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

function toVector({ lon, lat }: { lon: number; lat: number }): [number, number, number] {
  return [Math.cos(lat * RAD) * Math.cos(lon * RAD), Math.cos(lat * RAD) * Math.sin(lon * RAD), Math.sin(lat * RAD)];
}

/** The point a fraction `t` of the way along the great circle between two centres. */
function slerp(a: Camera, b: Camera, t: number): { lon: number; lat: number; angle: number } {
  const va = toVector(a);
  const vb = toVector(b);
  const dot = Math.max(-1, Math.min(1, va[0] * vb[0] + va[1] * vb[1] + va[2] * vb[2]));
  const angle = Math.acos(dot);
  if (angle < 1e-9) return { lon: a.lon, lat: a.lat, angle: 0 };
  const s = Math.sin(angle);
  const wa = Math.sin((1 - t) * angle) / s;
  const wb = Math.sin(t * angle) / s;
  const v = [wa * va[0] + wb * vb[0], wa * va[1] + wb * vb[1], wa * va[2] + wb * vb[2]] as const;
  return { lon: Math.atan2(v[1], v[0]) / RAD, lat: Math.atan2(v[2], Math.hypot(v[0], v[1])) / RAD, angle: angle / RAD };
}

/**
 * The fly-in: the centre moves along the great circle, the zoom in log steps, both on one ease. A trip longer than the
 * frame pulls back through the middle (never past the world view), so you see where you are going.
 */
export function flight(from: Camera, to: Camera, size: Size): (t: number) => Camera {
  const distance = slerp(from, to, 0).angle || slerp(from, to, 1).angle;
  const near = Math.min(from.ppd, to.ppd);
  const frame = Math.hypot(size.width, size.height);
  const fits = distance > 0 ? frame / (distance * 1.4) : Infinity;
  const floor = worldCamera(size).ppd;
  const peak = Math.max(floor, Math.min(near, fits));
  const dip = Math.log(near) - Math.log(peak);
  return (t: number): Camera => {
    if (t <= 0) return from;
    if (t >= 1) return to;
    const e = easeInOutCubic(t);
    const { lon, lat } = slerp(from, to, e);
    const ppd = Math.exp(Math.log(from.ppd) + (Math.log(to.ppd) - Math.log(from.ppd)) * e - dip * Math.sin(Math.PI * e));
    return { lon, lat, ppd };
  };
}
