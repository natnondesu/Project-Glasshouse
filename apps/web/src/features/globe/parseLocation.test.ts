import { describe, expect, it } from 'vitest';
import { parseLocation } from './parseLocation';

const at = (lat: number, lon: number) => ({ ok: true, location: { lat, lon } });

describe('Google Maps links', () => {
  it.each([
    ['a map view', 'https://www.google.com/maps/@13.6680521,100.6050012,17z', 13.668052, 100.605001],
    ['a map view with a tilt', 'https://www.google.com/maps/@13.668,100.605,3a,75y,90t/data=!3m6!1e1', 13.668, 100.605],
    ['a place, preferring its pin over the view', 'https://www.google.com/maps/place/Bangna/@13.6705,100.6012,15z/data=!4m6!3m5!1s0x311d5f5e:0x40b2!8m2!3d13.6681!4d100.6052!16s%2Fg%2F11', 13.6681, 100.6052],
    ['a place in Thai, encoded', 'https://www.google.com/maps/place/%E0%B8%9A%E0%B8%B2%E0%B8%87%E0%B8%99%E0%B8%B2/@13.66,100.6,14z/data=!3m1!4b1!4m6!3m5!8m2!3d13.6683!4d100.6049', 13.6683, 100.6049],
    ['a search q=', 'https://maps.google.com/?q=13.668,100.605', 13.668, 100.605],
    ['q= with loc:', 'https://maps.google.com/maps?q=loc:13.668,100.605&z=17', 13.668, 100.605],
    ['q= encoded with a space', 'https://www.google.com/maps?q=13.668%2C%20100.605', 13.668, 100.605],
    ['ll=', 'https://maps.google.com/maps?ll=13.668,100.605&z=16&t=m', 13.668, 100.605],
    ['the maps URL API query=', 'https://www.google.com/maps/search/?api=1&query=13.668%2C100.605', 13.668, 100.605],
    ['the maps URL API center=', 'https://www.google.com/maps/@?api=1&map_action=map&center=-33.8688,151.2093&zoom=12', -33.8688, 151.2093],
    ['a southern, western place', 'https://www.google.com/maps/place/Lima/@-12.0464,-77.0428,12z/data=!3d-12.0464!4d-77.0428', -12.0464, -77.0428],
    ['a search path with coordinates', 'https://www.google.com/maps/search/13.668,+100.605', 13.668, 100.605],
    ['a link without the scheme', 'google.com/maps/@13.668,100.605,15z', 13.668, 100.605],
    ['a geo: URI', 'geo:13.668,100.605?z=17', 13.668, 100.605],
    ['an OpenStreetMap view', 'https://www.openstreetmap.org/#map=17/13.66800/100.60500', 13.668, 100.605],
    ['an OpenStreetMap marker', 'https://www.openstreetmap.org/?mlat=13.668&mlon=100.605#map=17/13.6/100.6', 13.668, 100.605],
    ['a link pasted with spaces around it', '  https://www.google.com/maps/@13.668,100.605,17z \n', 13.668, 100.605],
  ])('reads %s', (_name, input, lat, lon) => {
    expect(parseLocation(input)).toMatchObject({ ...at(lat, lon), source: 'link' });
  });

  it.each(['https://maps.app.goo.gl/Ab12Cd34Ef56', 'https://goo.gl/maps/xyz123', 'maps.app.goo.gl/Ab12'])('explains that a short link %s has to be opened first', (input) => {
    expect(parseLocation(input)).toEqual({ ok: false, reason: 'short_link' });
  });

  it.each([
    'https://www.google.com/maps/place/Bangna',
    'https://www.google.com/maps/dir/Bangkok/Chiang+Mai',
    'https://example.com/?q=13.6,100.6x',
  ])('finds no coordinates in %s', (input) => {
    expect(parseLocation(input)).toEqual({ ok: false, reason: 'unrecognised' });
  });

  it('refuses a link whose numbers are off the Earth', () => {
    expect(parseLocation('https://www.google.com/maps/@113.668,100.605,17z')).toEqual({ ok: false, reason: 'out_of_range' });
  });
});

describe('coordinates typed or pasted', () => {
  it.each([
    ['13.668, 100.605', 13.668, 100.605],
    ['13.668,100.605', 13.668, 100.605],
    ['13.668 100.605', 13.668, 100.605],
    ['13.668;100.605', 13.668, 100.605],
    ['(13.668, 100.605)', 13.668, 100.605],
    ['-33.8688, 151.2093', -33.8688, 151.2093],
    ['13.668° N, 100.605° E', 13.668, 100.605],
    ['13.668N 100.605E', 13.668, 100.605],
    ['N13.668 E100.605', 13.668, 100.605],
    ['12.0464 S, 77.0428 W', -12.0464, -77.0428],
    ['13°40\'04.8"N 100°36\'18.0"E', 13.668, 100.605],
    ['13° 40′ 4.8″ N, 100° 36′ 18″ E', 13.668, 100.605],
    ['12°02\'47.0"S 77°02\'34.1"W', -12.046389, -77.042806],
    ['100.605 E, 13.668 N', 13.668, 100.605],
    ['0, 0', 0, 0],
    ['90, -180', 90, -180],
  ])('reads %s', (input, lat, lon) => {
    expect(parseLocation(input)).toMatchObject({ ...at(lat, lon), source: 'coordinates' });
  });

  it.each([
    ['', 'empty'],
    ['   ', 'empty'],
    ['Bangna campus', 'unrecognised'],
    ['13.668', 'unrecognised'],
    ['13.668, 100.605, 12', 'unrecognised'],
    ['13.668 N, 100.605 N', 'unrecognised'],
    ['-13.668 S, 100.605 E', 'unrecognised'],
    ['abc, def', 'unrecognised'],
    ['13.6.8, 100.6', 'unrecognised'],
    ['91, 100', 'out_of_range'],
    ['13, 181', 'out_of_range'],
    ['100.605, 13.668', 'out_of_range'],
    ['13°70\'00"N 100°00\'00"E', 'out_of_range'],
  ])('refuses %j (%s)', (input, reason) => {
    expect(parseLocation(input)).toEqual({ ok: false, reason });
  });
});

describe('hostile input', () => {
  const quick = (input: string) => {
    const started = performance.now();
    const result = parseLocation(input);
    expect(performance.now() - started).toBeLessThan(50);
    return result;
  };

  it.each([
    ['a long run of spaces', `1${' '.repeat(1000)}x`],
    ['spaces between numbers', `1${' '.repeat(1500)}2${' '.repeat(400)}x`],
    ['a long run of digits', '1'.repeat(1900)],
    ['digits and dots', '1.'.repeat(900)],
    ['NaN', 'NaN, NaN'],
    ['Infinity', 'Infinity, 100'],
    ['exponents', '1e5, 1e5'],
    ['mixed junk', '13°°°°\'\'\'"""NNNN 100°EEEE'.repeat(40)],
    ['DMS-shaped junk', `${'1° 2\' 3" '.repeat(150)}x`],
    ['a link-shaped run', `https://${'a.'.repeat(900)}`],
    ['a domain-shaped run without a slash', 'a.'.repeat(1000)],
    ['a link full of commas', `https://maps.google.com/?q=${'1,'.repeat(900)}`],
  ])('answers %s at once', (_name, input) => {
    expect(quick(input).ok).toBe(false);
  });

  it('refuses a paste far longer than any link', () => {
    expect(quick(`13.668, 100.605${' '.repeat(10_000)}`)).toEqual({ ok: false, reason: 'unrecognised' });
    expect(quick('x'.repeat(10_240))).toEqual({ ok: false, reason: 'unrecognised' });
  });

  it('still reads coordinates with odd spacing', () => {
    expect(quick('  13.668 ,   100.605  ')).toMatchObject({ ok: true, location: { lat: 13.668, lon: 100.605 } });
    expect(quick('13 ° 40 \' 4.8 " N    100 ° 36 \' 18 " E')).toMatchObject({ ok: true, location: { lat: 13.668, lon: 100.605 } });
  });
});
