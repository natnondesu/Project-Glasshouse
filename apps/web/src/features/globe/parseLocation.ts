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

/** Longer than any map link: refused before any pattern runs, so a huge paste costs nothing. */
export const MAX_INPUT_LENGTH = 2000;

type Atom = { kind: 'letter' | 'num' | 'deg' | 'min' | 'sec' | 'sep' | 'space'; text: string };
const ATOM = /[NSEW]|[-+]?\d+(?:\.\d+)?|°|'|"|[,;]| /iy;

/** Splits typed coordinates into atoms in one pass; anything else means it isn't coordinates. */
function atoms(text: string): Atom[] | null {
  const out: Atom[] = [];
  ATOM.lastIndex = 0;
  while (ATOM.lastIndex < text.length) {
    const at = ATOM.lastIndex;
    const match = ATOM.exec(text);
    if (!match || ATOM.lastIndex === at) return null;
    const t = match[0];
    const kind: Atom['kind'] = /^[NSEW]$/i.test(t) ? 'letter' : t === '°' ? 'deg' : t === "'" ? 'min' : t === '"' ? 'sec' : t === ',' || t === ';' ? 'sep' : t === ' ' ? 'space' : 'num';
    out.push({ kind, text: t });
  }
  return out;
}

interface Component {
  value: number;
  axis: 'lat' | 'lon' | null;
  valid: boolean;
}

/**
 * Reads one coordinate from `list` at `i`: a hemisphere letter before or after, degrees, then optional minutes (')
 * and seconds ("). One atom of look-ahead decides everything, so it runs in linear time.
 */
function component(list: Atom[], start: number, allowTrailingLetter: (letterBefore: boolean) => boolean): { c: Component; next: number } | null {
  let i = start;
  const skip = (): void => {
    while (list[i]?.kind === 'space') i++;
  };
  const peek = (): Atom | undefined => {
    let j = i;
    while (list[j]?.kind === 'space') j++;
    return list[j];
  };
  skip();
  let before: string | null = null;
  if (list[i]?.kind === 'letter') before = list[i++]!.text.toUpperCase();
  skip();
  if (list[i]?.kind !== 'num') return null;
  const deg = list[i++]!.text;
  if (peek()?.kind === 'deg') {
    skip();
    i++;
  }
  const take = (mark: 'min' | 'sec'): string | undefined => {
    let j = i;
    while (list[j]?.kind === 'space') j++;
    if (list[j]?.kind !== 'num') return undefined;
    let k = j + 1;
    while (list[k]?.kind === 'space') k++;
    if (list[k]?.kind !== mark) return undefined;
    i = k + 1;
    return list[j]!.text;
  };
  const min = take('min');
  const sec = take('sec');
  let after: string | null = null;
  if (peek()?.kind === 'letter' && allowTrailingLetter(before !== null)) {
    skip();
    after = list[i++]!.text.toUpperCase();
  }
  const letter = before ?? after;
  const signed = /^[-+]/.test(deg);
  const negative = deg.startsWith('-') || letter === 'S' || letter === 'W';
  const minutes = min === undefined ? 0 : Number(min);
  const seconds = sec === undefined ? 0 : Number(sec);
  // Minutes and seconds only follow whole degrees, below 60; a letter and a sign together, or two letters, are a typo.
  const dms = min !== undefined || sec !== undefined;
  const valid = !(before && after) && !(signed && letter) && (!dms || /^[-+]?\d+$/.test(deg)) && !/[-+]/.test(min ?? '') && !/[-+]/.test(sec ?? '');
  const magnitude = Math.abs(Number(deg)) + minutes / 60 + seconds / 3600;
  const value = minutes < 60 && seconds < 60 ? (negative ? -magnitude : magnitude) : Number.NaN;
  return { c: { value, axis: letter === null ? null : letter === 'N' || letter === 'S' ? 'lat' : 'lon', valid }, next: i };
}

function fromCoordinates(input: string): ParsedLocation {
  const text = input
    .replace(/[′’‘`]/g, "'")
    .replace(/[″”“]|''/g, '"')
    .replace(/º/g, '°')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\(\s*|\s*\)$/g, '');
  const list = atoms(text);
  if (!list) return fail('unrecognised');
  // A letter right after the first number belongs to it only when it had none in front ("13.6 N, …" vs "N13.6 E100.6").
  const first = component(list, 0, (letterBefore) => !letterBefore);
  if (!first) return fail('unrecognised');
  // Between the two: spaces and at most one comma or semicolon, but something.
  let i = first.next;
  let commas = 0;
  while (list[i]?.kind === 'space' || list[i]?.kind === 'sep') commas += list[i++]!.kind === 'sep' ? 1 : 0;
  if (i === first.next || commas > 1) return fail('unrecognised');
  const second = component(list, i, () => true);
  if (!second) return fail('unrecognised');
  let end = second.next;
  while (list[end]?.kind === 'space') end++;
  if (end !== list.length) return fail('unrecognised');
  const a = first.c;
  const b = second.c;
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
  if (raw.length > MAX_INPUT_LENGTH) return fail('unrecognised');
  const input = raw.trim();
  if (input === '') return fail('empty');
  if (SHORT_LINK.test(input)) return fail('short_link');
  if (/^geo:/i.test(input) || LINK.test(input)) return fromLink(input);
  return fromCoordinates(input);
}
