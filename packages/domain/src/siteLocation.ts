import type { GeoPoint } from './model/types';
import { err, ok, type Result } from './result';

/** Six decimals is about 10 cm: finer than any map pin, and keeps stored files tidy. */
const DECIMALS = 1e6;
const round = (n: number): number => Math.round(n * DECIMALS) / DECIMALS;

const inRange = (n: unknown, limit: number): n is number => typeof n === 'number' && Number.isFinite(n) && n >= -limit && n <= limit;

/** A location as sent by anyone (a browser, a file): only a finite latitude and longitude in range, rounded; nothing else is kept. */
export function validateLocation(raw: unknown): Result<GeoPoint> {
  if (typeof raw !== 'object' || raw === null) return err('invalid_value', 'A location is a latitude and a longitude.');
  const { lat, lon } = raw as { lat?: unknown; lon?: unknown };
  if (!inRange(lat, 90)) return err('invalid_value', 'Latitude must be between -90 and 90.');
  if (!inRange(lon, 180)) return err('invalid_value', 'Longitude must be between -180 and 180.');
  return ok({ lat: round(lat), lon: round(lon) });
}
