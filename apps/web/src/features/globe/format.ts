import type { GeoPoint } from '@glasshouse/domain';

/** "13.66800° N, 100.60500° E": five decimals is about a metre, as precise as anyone places a site. */
export function formatLatLon({ lat, lon }: GeoPoint): string {
  const part = (v: number, pos: string, neg: string): string => `${Math.abs(v).toFixed(5)}° ${v < 0 ? neg : pos}`;
  return `${part(lat, 'N', 'S')}, ${part(lon, 'E', 'W')}`;
}
