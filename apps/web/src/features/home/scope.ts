import type { Messages } from '../../i18n';
import { countryByCode, placeName, type PlaceRef } from '../globe/regionNames';
import type { SiteSummary } from '../globe/sites';

export { placeName } from '../globe/regionNames';

/**
 * What Home's numbers and rooms count, set from the globe: everything, a country or province, the sites under one
 * count marker, or one site. The camera can wander; the scope only changes when someone picks a place.
 */
export type Scope =
  | { kind: 'world' }
  | { kind: 'region'; level: 'country' | 'province'; code: string }
  | { kind: 'sites'; ids: string[] }
  | { kind: 'site'; id: string };

export interface SitePlace {
  country: PlaceRef | null;
  province: PlaceRef | null;
}

/** Each placed site's country and province, known once the map's outlines have loaded. */
export type SitePlaces = ReadonlyMap<string, SitePlace>;

export const WORLD: Scope = { kind: 'world' };

const CODE = /^[A-Z]{2}(-[A-Z0-9]{1,3})?$/;
const ID = /^[\w-]+$/;

/** The scope a `?scope=` value names; anything unreadable is the whole world. */
export function parseScope(param: string | null): Scope {
  if (!param) return WORLD;
  const at = param.indexOf(':');
  if (at < 0) return WORLD;
  const kind = param.slice(0, at);
  const value = param.slice(at + 1);
  if ((kind === 'country' || kind === 'province') && CODE.test(value)) return { kind: 'region', level: kind, code: value };
  if (kind === 'site' && ID.test(value)) return { kind: 'site', id: value };
  if (kind === 'sites') {
    const ids = value.split(',').filter((id) => ID.test(id));
    if (ids.length > 0) return { kind: 'sites', ids };
  }
  return WORLD;
}

export function scopeParam(scope: Scope): string | null {
  switch (scope.kind) {
    case 'world':
      return null;
    case 'region':
      return `${scope.level}:${scope.code}`;
    case 'site':
      return `site:${scope.id}`;
    case 'sites':
      return `sites:${scope.ids.join(',')}`;
  }
}

export const sameScope = (a: Scope, b: Scope): boolean => scopeParam(a) === scopeParam(b);

/** A scope whose sites are gone (deleted, archived, a stale link) falls back to what is left of it, else the world. */
export function validScope(scope: Scope, sites: SiteSummary[]): Scope {
  const known = (id: string): boolean => sites.some((s) => s.site.id === id);
  if (scope.kind === 'site') return known(scope.id) ? scope : WORLD;
  if (scope.kind === 'sites') {
    const ids = scope.ids.filter(known);
    if (ids.length === 0) return WORLD;
    return ids.length === scope.ids.length ? scope : { kind: 'sites', ids };
  }
  return scope;
}

/** The sites in scope, in the tree's order. Null for a region while the map hasn't said which sites fall in it. */
export function resolveScope(scope: Scope, sites: SiteSummary[], places: SitePlaces | null): SiteSummary[] | null {
  switch (scope.kind) {
    case 'world':
      return sites;
    case 'site':
      return sites.filter((s) => s.site.id === scope.id);
    case 'sites':
      return sites.filter((s) => scope.ids.includes(s.site.id));
    case 'region': {
      if (!places) return null;
      return sites.filter((s) => places.get(s.site.id)?.[scope.level]?.code === scope.code);
    }
  }
}

const NAMED_SITES = 2;

export function scopeLabel(scope: Scope, sites: SiteSummary[], places: SitePlaces | null, m: Messages, lang: 'en' | 'th'): string {
  const nameOf = (id: string): string => sites.find((s) => s.site.id === id)?.site.name ?? '';
  switch (scope.kind) {
    case 'world':
      return m.home.everywhere;
    case 'site':
      return nameOf(scope.id);
    case 'sites': {
      const names = scope.ids.map(nameOf);
      return names.length <= NAMED_SITES ? names.join(', ') : m.home.andMore(names[0]!, names.length - 1);
    }
    case 'region': {
      const ref = places ? [...places.values()].map((p) => p[scope.level]).find((p) => p?.code === scope.code) : undefined;
      if (ref) return placeName(ref, lang);
      return scope.level === 'country' ? countryByCode(scope.code, lang) : scope.code;
    }
  }
}
