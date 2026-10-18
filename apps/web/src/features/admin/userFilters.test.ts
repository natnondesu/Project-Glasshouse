import { describe, expect, it } from 'vitest';
import type { AdminUser } from './adminApi';
import { applyQuery, DEFAULT_QUERY, facetCount, isDefaultFilters, isInactive, isNew, matchesSearch, parseQuery, queryToParams, sortUsers, toggleSort, type UserQuery } from './userFilters';

const NOW = Date.parse('2026-10-18T12:00:00.000Z');
const daysAgo = (d: number): string => new Date(NOW - d * 86_400_000).toISOString();

const person = (over: Partial<AdminUser>): AdminUser => ({
  id: over.email ?? 'x',
  email: 'x@company.test',
  displayName: 'X',
  role: 'viewer',
  source: 'oidc',
  active: true,
  mustChangePassword: false,
  nameLocked: false,
  createdAt: daysAgo(400),
  lastLoginAt: daysAgo(1),
  ...over,
});

const q = (over: Partial<UserQuery>): UserQuery => ({ ...DEFAULT_QUERY, ...over });
const names = (list: AdminUser[]): string[] => list.map((u) => u.displayName);

describe('search', () => {
  const ploy = person({ displayName: 'Ploy Sriwan', email: 'Ploy.S@Company.test' });
  const somchai = person({ displayName: 'สมชาย ใจดี', email: 'somchai@company.test' });

  it('matches name or email, ignoring case', () => {
    expect(matchesSearch(ploy, 'ploy')).toBe(true);
    expect(matchesSearch(ploy, 'PLOY.s@company')).toBe(true);
    expect(matchesSearch(ploy, 'sriwan')).toBe(true);
    expect(matchesSearch(ploy, 'kanya')).toBe(false);
  });

  it('needs every word, in any order', () => {
    expect(matchesSearch(ploy, 'sriwan ploy')).toBe(true);
    expect(matchesSearch(ploy, 'ploy kanya')).toBe(false);
  });

  it('matches Thai names, keeping their vowels and tone marks', () => {
    expect(matchesSearch(somchai, 'สมชาย')).toBe(true);
    expect(matchesSearch(somchai, 'ใจดี')).toBe(true);
    // A typed prefix matches; a different vowel is a different word, not a looser match.
    expect(matchesSearch(somchai, 'ใจด')).toBe(true);
    expect(matchesSearch(somchai, 'ใจดิ')).toBe(false);
  });

  it('ignores Latin accents and surrounding space; an empty search matches everyone', () => {
    expect(matchesSearch(person({ displayName: 'José Ramírez' }), 'jose ramirez')).toBe(true);
    expect(matchesSearch(ploy, '   ')).toBe(true);
  });
});

describe('access review', () => {
  it('counts someone inactive after 90 days without a sign-in', () => {
    expect(isInactive(person({ lastLoginAt: daysAgo(91) }), NOW)).toBe(true);
    expect(isInactive(person({ lastLoginAt: daysAgo(89) }), NOW)).toBe(false);
  });

  it('counts someone who never signed in as inactive only once their account is 90 days old', () => {
    expect(isInactive(person({ lastLoginAt: null, createdAt: daysAgo(120) }), NOW)).toBe(true);
    expect(isInactive(person({ lastLoginAt: null, createdAt: daysAgo(10) }), NOW)).toBe(false);
  });

  it('counts accounts created within 30 days as new', () => {
    expect(isNew(person({ createdAt: daysAgo(29) }), NOW)).toBe(true);
    expect(isNew(person({ createdAt: daysAgo(31) }), NOW)).toBe(false);
  });
});

describe('filters', () => {
  const people = [
    person({ email: 'a@x', displayName: 'Active Admin', role: 'admin', source: 'local' }),
    person({ email: 'b@x', displayName: 'Off Editor', role: 'editor', active: false }),
    person({ email: 'c@x', displayName: 'New Local', role: 'editor', source: 'local', mustChangePassword: true, createdAt: daysAgo(3), lastLoginAt: null }),
    person({ email: 'd@x', displayName: 'Quiet Viewer', lastLoginAt: daysAgo(200) }),
    person({ email: 'e@x', displayName: 'Off Must Change', active: false, mustChangePassword: true }),
  ];
  const run = (over: Partial<UserQuery>) => names(applyQuery(people, q(over), NOW, 'en'));

  it('shows active people by default', () => {
    expect(run({})).toEqual(['Active Admin', 'New Local', 'Quiet Viewer']);
  });

  it('filters by status; must-change means active people who still have to choose a password', () => {
    expect(run({ status: 'all' })).toHaveLength(5);
    expect(run({ status: 'off' })).toEqual(['Off Editor', 'Off Must Change']);
    expect(run({ status: 'must-change' })).toEqual(['New Local']);
  });

  it('filters by sign-in, role and access review, all together', () => {
    expect(run({ source: 'local' })).toEqual(['Active Admin', 'New Local']);
    expect(run({ source: 'company', status: 'all' })).toEqual(['Off Editor', 'Off Must Change', 'Quiet Viewer']);
    expect(run({ role: 'editor', status: 'all' })).toEqual(['New Local', 'Off Editor']);
    expect(run({ review: 'inactive' })).toEqual(['Quiet Viewer']);
    expect(run({ review: 'new' })).toEqual(['New Local']);
    expect(run({ review: 'new', source: 'company' })).toEqual([]);
    expect(run({ q: 'quiet', role: 'viewer' })).toEqual(['Quiet Viewer']);
  });

  it('counts what a chip would show with the other filters kept', () => {
    expect(facetCount(people, q({}), { status: 'off' }, NOW)).toBe(2);
    expect(facetCount(people, q({ source: 'local' }), { status: 'off' }, NOW)).toBe(0);
    expect(facetCount(people, q({}), { review: 'inactive' }, NOW)).toBe(1);
  });

  it('knows when only the default view is on', () => {
    expect(isDefaultFilters(DEFAULT_QUERY)).toBe(true);
    expect(isDefaultFilters(q({ sort: 'role', desc: true }))).toBe(true);
    expect(isDefaultFilters(q({ q: 'x' }))).toBe(false);
    expect(isDefaultFilters(q({ status: 'all' }))).toBe(false);
  });
});

describe('sorting', () => {
  it('sorts names the way the interface language reads them', () => {
    const people = ['สมชาย', 'Zed', 'กนก', 'เกศินี', 'ขวัญ', 'arthit', 'Ploy'].map((n) => person({ email: n, displayName: n }));
    expect(names(sortUsers(people, 'name', false, 'en'))).toEqual(['arthit', 'Ploy', 'Zed', 'กนก', 'เกศินี', 'ขวัญ', 'สมชาย']);
    // Thai order files เกศินี under ก, not under its leading vowel.
    const thai = names(sortUsers(people, 'name', false, 'th')).filter((n) => /\p{Script=Thai}/u.test(n));
    expect(thai).toEqual(['กนก', 'เกศินี', 'ขวัญ', 'สมชาย']);
  });

  it('sorts by last sign-in with never-signed-in as the oldest, and by role with ties by name', () => {
    const people = [
      person({ email: '1', displayName: 'Recent', lastLoginAt: daysAgo(1), role: 'viewer' }),
      person({ email: '2', displayName: 'Never', lastLoginAt: null, role: 'admin' }),
      person({ email: '3', displayName: 'Old', lastLoginAt: daysAgo(100), role: 'admin' }),
    ];
    expect(names(sortUsers(people, 'last', false, 'en'))).toEqual(['Never', 'Old', 'Recent']);
    expect(names(sortUsers(people, 'last', true, 'en'))).toEqual(['Recent', 'Old', 'Never']);
    expect(names(sortUsers(people, 'role', true, 'en'))).toEqual(['Never', 'Old', 'Recent']);
    expect(names(sortUsers(people, 'role', false, 'en'))).toEqual(['Recent', 'Never', 'Old']);
  });

  it('does not reorder the list it was given', () => {
    const people = [person({ email: 'b', displayName: 'B' }), person({ email: 'a', displayName: 'A' })];
    sortUsers(people, 'name', false, 'en');
    expect(names(people)).toEqual(['B', 'A']);
  });

  it('flips direction on the same column, and starts each column the useful way round', () => {
    expect(toggleSort(q({}), 'name')).toMatchObject({ sort: 'name', desc: true });
    expect(toggleSort(q({ sort: 'name', desc: true }), 'name')).toMatchObject({ sort: 'name', desc: false });
    // Oldest sign-in first is the access-review question; admins first is the role question.
    expect(toggleSort(q({}), 'last')).toMatchObject({ sort: 'last', desc: false });
    expect(toggleSort(q({}), 'role')).toMatchObject({ sort: 'role', desc: true });
  });
});

describe('the address bar', () => {
  it('leaves the default view out of the address', () => {
    expect(queryToParams(DEFAULT_QUERY).toString()).toBe('');
  });

  it('writes and reads back every filter, the search and the sort', () => {
    const query = q({ q: 'สมชาย ploy', status: 'off', source: 'local', role: 'reviewer', review: 'inactive', sort: 'last', desc: true });
    const params = queryToParams(query);
    expect(params.get('status')).toBe('off');
    expect(params.get('sort')).toBe('-last');
    expect(parseQuery(new URLSearchParams(params.toString()))).toEqual(query);
  });

  it('keeps other parameters and falls back to defaults for values it does not know', () => {
    const base = new URLSearchParams('other=1&status=bogus');
    expect(queryToParams(q({ role: 'admin' }), base).toString()).toBe('other=1&role=admin');
    expect(parseQuery(new URLSearchParams('status=bogus&role=root&sort=height&review=x&signin=fax'))).toEqual(DEFAULT_QUERY);
  });
});
