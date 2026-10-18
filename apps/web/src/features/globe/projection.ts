import { geoDistance, geoOrthographic, type GeoProjection } from 'd3-geo';
import type { Camera, GeoBox, Size } from './camera';

const DEG = 180 / Math.PI;

/** The globe as seen by the camera, in CSS pixels; everything off the canvas is clipped before it is drawn. */
export function projectionFor(camera: Camera, size: Size): GeoProjection {
  return geoOrthographic()
    .rotate([-camera.lon, -camera.lat])
    .scale(camera.ppd * DEG)
    .translate([size.width / 2, size.height / 2])
    .clipAngle(90)
    .clipExtent([
      [-2, -2],
      [size.width + 2, size.height + 2],
    ])
    // Adaptive resampling: coarser on the world view, where a pixel is many kilometres.
    .precision(camera.ppd < 12 ? 0.9 : 0.4);
}

/** Where a point lands on screen, or null on the far side of the globe. */
export function screenOf(projection: GeoProjection, camera: Camera, lon: number, lat: number): [number, number] | null {
  if (geoDistance([lon, lat], [camera.lon, camera.lat]) > Math.PI / 2 - 1e-3) return null;
  return projection([lon, lat]);
}

/** The part of the globe in view, with a margin; null when most of a hemisphere shows (nothing worth leaving out). */
export function visibleBox(camera: Camera, size: Size, margin = 1.25): GeoBox | null {
  const halfLat = ((size.height / 2) * margin) / camera.ppd;
  const cos = Math.cos((camera.lat * Math.PI) / 180);
  const halfLon = ((size.width / 2) * margin) / (camera.ppd * Math.max(cos, 0.05));
  if (halfLat > 45 || halfLon > 60 || Math.abs(camera.lat) + halfLat > 80) return null;
  return [
    [camera.lon - halfLon, camera.lat - halfLat],
    [camera.lon + halfLon, camera.lat + halfLat],
  ];
}

const overlaps = (a0: number, a1: number, b0: number, b1: number): boolean => a0 <= b1 && b0 <= a1;

/** True when a region's box can touch the view; boxes crossing the antimeridian are checked on both sides. */
export function boxTouches(region: GeoBox, view: GeoBox | null): boolean {
  if (!view) return true;
  const [[w, s], [e, n]] = region;
  const [[vw, vs], [ve, vn]] = view;
  if (!overlaps(s, n, vs, vn)) return false;
  const spans: [number, number][] = e >= w ? [[w, e]] : [[w, 180], [-180, e]];
  return spans.some(([a, b]) => [-360, 0, 360].some((shift) => overlaps(a + shift, b + shift, vw, ve)));
}
