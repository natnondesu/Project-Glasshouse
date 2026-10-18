import type { Role } from '../../auth/authApi';
import type { Lang } from '../../i18n/lang';
import type { AdminUser } from './adminApi';

export const ROLES: Role[] = ['viewer', 'editor', 'reviewer', 'admin'];
export const STATUSES = ['all', 'active', 'off', 'must-change'] as const;
export const SOURCES = ['any', 'company', 'local'] as const;
export const REVIEWS = ['none', 'inactive', 'new'] as const;
const SORTS = ['name', 'last', 'role'] as const;

export type StatusFilter = (typeof STATUSES)[number];
export type SourceFilter = (typeof SOURCES)[number];
export type RoleFilter = 'any' | Role;
export type ReviewFilter = (typeof REVIEWS)[number];
export type SortKey = (typeof SORTS)[number];

export interface UserQuery {
  q: string;
  status: StatusFilter;
  source: SourceFilter;
  role: RoleFilter;
  review: ReviewFilter;
  sort: SortKey;
  desc: boolean;
}

/** Switched-off people stay out of the way until asked for. */
export const DEFAULT_QUERY: UserQuery = { q: '', status: 'active', source: 'any', role: 'any', review: 'none', sort: 'name', desc: false };

const DAY_MS = 86_400_000;
export const INACTIVE_DAYS = 90;
export const NEW_DAYS = 30;

const ago = (iso: string, now: number): number => now - Date.parse(iso);

/** No sign-in for 90 days; someone who never signed in counts once their account is that old. */
export const isInactive = (u: AdminUser, now: number): boolean => ago(u.lastLoginAt ?? u.createdAt, now) > INACTIVE_DAYS * DAY_MS;
export const isNew = (u: AdminUser, now: number): boolean => ago(u.createdAt, now) <= NEW_DAYS * DAY_MS;

// Latin accents fold away ("jose" finds José); Thai vowels and tone marks are letters and stay.
const LATIN_MARKS = /[̀-ͯ]/g;
const fold = (s: string): string => s.normalize('NFD').replace(LATIN_MARKS, '').normalize('NFC').toLocaleLowerCase();

/** Every word of the search appears in the name or the email. */
export function matchesSearch(u: AdminUser, search: string): boolean {
  const words = fold(search).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const hay = fold(`${u.displayName} ${u.email}`);
  return words.every((w) => hay.includes(w));
}

const STATUS_TEST: Record<StatusFilter, (u: AdminUser) => boolean> = {
  all: () => true,
  active: (u) => u.active,
  off: (u) => !u.active,
  'must-change': (u) => u.active && u.mustChangePassword,
};

/** Whether someone belongs in the current view: filters and search together. */
export function matchesQuery(u: AdminUser, query: UserQuery, now: number): boolean {
  if (!STATUS_TEST[query.status](u)) return false;
  if (query.source !== 'any' && (query.source === 'company') !== (u.source === 'oidc')) return false;
  if (query.role !== 'any' && u.role !== query.role) return false;
  if (query.review === 'inactive' && !isInactive(u, now)) return false;
  if (query.review === 'new' && !isNew(u, now)) return false;
  return matchesSearch(u, query.q);
}

/** How many people a chip would show if pressed, keeping the search and the other filters. */
export function facetCount(users: AdminUser[], query: UserQuery, change: Partial<UserQuery>, now: number): number {
  const next = { ...query, ...change };
  return users.filter((u) => matchesQuery(u, next, now)).length;
}

const collators = new Map<Lang, Intl.Collator>();
const collatorFor = (lang: Lang): Intl.Collator => {
  let c = collators.get(lang);
  if (!c) {
    c = new Intl.Collator(lang, { sensitivity: 'base', numeric: true });
    collators.set(lang, c);
  }
  return c;
};

/** A new, sorted list; ties fall back to the name so the order never jumps. */
export function sortUsers(users: AdminUser[], sort: SortKey, desc: boolean, lang: Lang): AdminUser[] {
  const byName = collatorFor(lang).compare;
  const lastOf = (u: AdminUser): number => (u.lastLoginAt ? Date.parse(u.lastLoginAt) : -Infinity);
  const primary = (a: AdminUser, b: AdminUser): number => {
    if (sort === 'last') return lastOf(a) === lastOf(b) ? 0 : lastOf(a) < lastOf(b) ? -1 : 1;
    if (sort === 'role') return ROLES.indexOf(a.role) - ROLES.indexOf(b.role);
    return byName(a.displayName, b.displayName);
  };
  const sign = desc ? -1 : 1;
  return [...users].sort((a, b) => sign * primary(a, b) || byName(a.displayName, b.displayName) || a.email.localeCompare(b.email));
}

export function applyQuery(users: AdminUser[], query: UserQuery, now: number, lang: Lang): AdminUser[] {
  return sortUsers(
    users.filter((u) => matchesQuery(u, query, now)),
    query.sort,
    query.desc,
    lang,
  );
}

/** Nothing narrows the list beyond the default Active view (the sort does not count). */
export const isDefaultFilters = (query: UserQuery): boolean =>
  query.q.trim() === '' && query.status === DEFAULT_QUERY.status && query.source === 'any' && query.role === 'any' && query.review === 'none';

/** The useful first direction per column: A to Z, oldest sign-in first (the access-review question), admins first. */
const FIRST_DESC: Record<SortKey, boolean> = { name: false, last: false, role: true };

export const toggleSort = (query: UserQuery, sort: SortKey): UserQuery =>
  query.sort === sort ? { ...query, desc: !query.desc } : { ...query, sort, desc: FIRST_DESC[sort] };

const PARAMS = ['q', 'status', 'signin', 'role', 'review', 'sort'] as const;
const pick = <T extends string>(allowed: readonly T[], raw: string | null, fallback: T): T => (allowed.includes(raw as T) ? (raw as T) : fallback);

export const hasQueryParams = (params: URLSearchParams): boolean => PARAMS.some((k) => params.has(k));

export function parseQuery(params: URLSearchParams): UserQuery {
  const rawSort = params.get('sort') ?? '';
  const key = rawSort.replace(/^-/, '');
  const known = SORTS.includes(key as SortKey);
  return {
    q: params.get('q') ?? '',
    status: pick(STATUSES, params.get('status'), DEFAULT_QUERY.status),
    source: pick(SOURCES, params.get('signin'), 'any'),
    role: pick<RoleFilter>(['any', ...ROLES], params.get('role'), 'any'),
    review: pick(REVIEWS, params.get('review'), 'none'),
    sort: known ? (key as SortKey) : DEFAULT_QUERY.sort,
    desc: known && rawSort.startsWith('-'),
  };
}

/** The query as address parameters, defaults left out; parameters that are not ours are kept. */
export function queryToParams(query: UserQuery, base: URLSearchParams = new URLSearchParams()): URLSearchParams {
  const next = new URLSearchParams(base);
  for (const k of PARAMS) next.delete(k);
  if (query.q.trim()) next.set('q', query.q);
  if (query.status !== DEFAULT_QUERY.status) next.set('status', query.status);
  if (query.source !== 'any') next.set('signin', query.source);
  if (query.role !== 'any') next.set('role', query.role);
  if (query.review !== 'none') next.set('review', query.review);
  if (query.sort !== 'name' || query.desc) next.set('sort', `${query.desc ? '-' : ''}${query.sort}`);
  return next;
}
