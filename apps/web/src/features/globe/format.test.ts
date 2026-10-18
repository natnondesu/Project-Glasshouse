import { expect, it } from 'vitest';
import { formatLatLon } from './format';

it('writes coordinates with hemispheres and five decimals', () => {
  expect(formatLatLon({ lat: 13.668, lon: 100.605 })).toBe('13.66800° N, 100.60500° E');
  expect(formatLatLon({ lat: -12.0464, lon: -77.0428 })).toBe('12.04640° S, 77.04280° W');
  expect(formatLatLon({ lat: 0, lon: 0 })).toBe('0.00000° N, 0.00000° E');
});
