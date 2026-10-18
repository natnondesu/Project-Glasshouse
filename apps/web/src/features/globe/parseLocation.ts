import type { GeoPoint } from '@glasshouse/domain';

export type LocationProblem = 'empty' | 'unrecognised' | 'out_of_range' | 'short_link';
export type ParsedLocation = { ok: true; location: GeoPoint; source: 'link' | 'coordinates' } | { ok: false; reason: LocationProblem };

const NUM = '[-+]?\\d{1,3}(?:\\.\\d+)?';
const PAIR = new RegExp(`^(?:loc:)?\\s*(${NUM})\\s*,\\s*(${NUM})\\s*$`);
/** A Google Maps place: the pin itself (`!3d` latitude, `!4d` longitude), which beats the view's centre. */
const PIN = new RegExp(`!3d(${NUM})!4d(${NUM})`);
const VIEW = new RegExp(`@(${NUM}),(${NUM})`);
const SEARCH_PATH = new RegExp(`/maps/(?:search|place)/(${NUM}),\\s*(${NUM})(?:[/?#]|$)`);
const GEO_URI = new RegExp(`^geo:(${NUM}),(${NUM})`, 'i');
const OSM_VIEW = new RegExp(`map=\\d{1,2}/(${NUM})/(${NUM})`);
const PAIR_PARAMS = ['q', 'query', 'll', 'center', 'sll', 'destination', 'daddr'];
const SHORT_LINK = /^(?:https?:\/\/)?(?:maps\.app\.goo\.gl|goo\.gl\/maps)\//i;
const LINK = /^(?:https?:\/\/|[\w-]+(?:\.[\w-]+)+\/)/i;

const fail = (reason: LocationProblem): ParsedLocation => ({ ok: false, reason });
const round6 = (n: number): number => Math.round(n * 1e6) / 1e6;

function located(lat: number, lon: number, source: 'link' | 'coordinates'): ParsedLocation {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return fail('out_of_range');
  return { ok: true, location: { lat: round6(lat) + 0, lon: round6(lon) + 0 }, source };
}

function decoded(text: string): string {
  try {
    return decodeURIComponent(text.replace(/\+/g, ' '));
  } catch {
    return text;
  }
}

function fromLink(input: string): ParsedLocation {
  const text = decoded(input);
  const geo = GEO_URI.exec(text);
  if (geo) return located(Number(geo[1]), Number(geo[2]), 'link');
  const pin = PIN.exec(text);
  if (pin) return located(Number(pin[1]), Number(pin[2]), 'link');
  let url: URL | null = null;
  try {
    url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
  } catch {
    url = null;
  }
  if (url) {
    for (const name of PAIR_PARAMS) {
      const pair = PAIR.exec(url.searchParams.get(name) ?? '');
      if (pair) return located(Number(pair[1]), Number(pair[2]), 'link');
    }
    const mlat = url.searchParams.get('mlat');
    const mlon = url.searchParams.get('mlon');
    if (mlat && mlon && new RegExp(`^${NUM}$`).test(mlat) && new RegExp(`^${NUM}$`).test(mlon)) return located(Number(mlat), Number(mlon), 'link');
  }
  for (const pattern of [VIEW, SEARCH_PATH, OSM_VIEW]) {
    const match = pattern.exec(text);
    if (match) return located(Number(match[1]), Number(match[2]), 'link');
  }
  return fail('unrecognised');
}

/** One coordinate: decimal degrees or degrees-minutes-seconds, with a sign or a hemisphere letter before or after. */
const COMPONENT = `([NSEW])?\\s*([-+]?\\d+(?:\\.\\d+)?)\\s*°?\\s*(?:(\\d+(?:\\.\\d+)?)\\s*'\\s*)?(?:(\\d+(?:\\.\\d+)?)\\s*"\\s*)?([NSEW])?`;
const TWO_COMPONENTS = new RegExp(`^${COMPONENT}(?:\\s*[,;]\\s*|\\s+)${COMPONENT}$`, 'i');

interface Component {
  value: number;
  axis: 'lat' | 'lon' | null;
  valid: boolean;
}

function component(parts: (string | undefined)[]): Component {
  const [before, deg = '', min, sec, after] = parts;
  const letter = (before ?? after)?.toUpperCase() ?? null;
  const signed = /^[-+]/.test(deg);
  const negative = deg.startsWith('-') || letter === 'S' || letter === 'W';
  const minutes = min === undefined ? 0 : Number(min);
  const seconds = sec === undefined ? 0 : Number(sec);
  // Minutes and seconds only follow whole degrees, below 60; a letter and a sign together, or two letters, are a typo.
  const dms = min !== undefined || sec !== undefined;
  const valid = !(before && after) && !(signed && letter) && (!dms || /^[-+]?\d+$/.test(deg));
  const inRange = minutes < 60 && seconds < 60;
  const magnitude = Math.abs(Number(deg)) + minutes / 60 + seconds / 3600;
  return {
    value: inRange ? (negative ? -magnitude : magnitude) : Number.NaN,
    axis: letter === null ? null : letter === 'N' || letter === 'S' ? 'lat' : 'lon',
    valid,
  };
}

function fromCoordinates(input: string): ParsedLocation {
  const text = input
    .replace(/[′’‘`]/g, "'")
    .replace(/[″”“]|''/g, '"')
    .replace(/º/g, '°')
    .replace(/^\(\s*|\s*\)$/g, '');
  const match = TWO_COMPONENTS.exec(text);
  if (!match) return fail('unrecognised');
  const a = component(match.slice(1, 6));
  const b = component(match.slice(6, 11));
  if (!a.valid || !b.valid) return fail('unrecognised');
  // Letters decide which is which; without them the order is latitude, longitude (as Google Maps copies them).
  if (a.axis && b.axis && a.axis === b.axis) return fail('unrecognised');
  if ((a.axis === null) !== (b.axis === null) && (a.axis === 'lon' || b.axis === 'lat')) return fail('unrecognised');
  const [lat, lon] = a.axis === 'lon' || b.axis === 'lat' ? [b.value, a.value] : [a.value, b.value];
  return located(lat, lon, 'coordinates');
}

/**
 * Reads where a site is from what someone pastes: a Google Maps (or OpenStreetMap) link, or coordinates in the forms
 * Google Maps shows them. Short links (maps.app.goo.gl) only resolve over the network, so they are explained instead.
 */
export function parseLocation(raw: string): ParsedLocation {
  const input = raw.trim();
  if (input === '') return fail('empty');
  if (SHORT_LINK.test(input)) return fail('short_link');
  if (/^geo:/i.test(input) || LINK.test(input)) return fromLink(input);
  return fromCoordinates(input);
}
