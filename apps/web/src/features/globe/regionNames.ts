/** A country or province as names need it: no outlines, so Home can name places before the map's data arrives. */
export interface PlaceRef {
  /** ISO code: alpha-2 for a country, 3166-2 for a province. Null for a few disputed areas without one. */
  code: string | null;
  /** English name from the data. */
  name: string;
  /** Thai name when the data has one (provinces); countries take theirs from the browser. */
  nameTh: string | null;
}

const displayNames = new Map<string, Intl.DisplayNames | null>();

function countryName(code: string, lang: 'en' | 'th'): string | null {
  if (!displayNames.has(lang)) {
    try {
      displayNames.set(lang, new Intl.DisplayNames([lang], { type: 'region', fallback: 'none' }));
    } catch {
      displayNames.set(lang, null);
    }
  }
  try {
    return displayNames.get(lang)?.of(code) ?? null;
  } catch {
    return null;
  }
}

/** A place's name in the interface language: provinces carry Thai in the data; countries use the browser's own names. */
export function placeName(place: PlaceRef, lang: 'en' | 'th'): string {
  if (place.nameTh !== null) return lang === 'th' ? place.nameTh : place.name;
  if (!place.code) return place.name;
  return countryName(place.code, lang) ?? place.name;
}

/** A country by its ISO code alone, for a scope read from the address before the map has loaded. */
export const countryByCode = (code: string, lang: 'en' | 'th'): string => countryName(code, lang) ?? code;
