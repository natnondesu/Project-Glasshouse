import { apply, createWorkspace, withSample, type Workspace, type WorkspaceCommand } from '@glasshouse/domain';
import { describe, expect, it } from 'vitest';
import { en } from '../../i18n/en';
import { th } from '../../i18n/th';
import { siteSummaries, type SiteSummary } from '../globe/sites';
import { parseScope, placeName, resolveScope, scopeLabel, scopeParam, validScope, type Scope, type SitePlaces } from './scope';

const AT = '2026-10-18T00:00:00.000Z';
const run = (ws: Workspace, ...cmds: WorkspaceCommand[]): Workspace =>
  cmds.reduce((w, c) => {
    const r = apply(w, c);
    if (!r.ok) throw new Error(r.error.message);
    return r.value;
  }, ws);
const sample = (): Workspace => {
  const r = withSample(createWorkspace(), AT);
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
};

const TH = { code: 'TH', name: 'Thailand', nameTh: null };
const AU = { code: 'AU', name: 'Australia', nameTh: null };
const BKK = { code: 'TH-10', name: 'Bangkok', nameTh: 'กรุงเทพมหานคร' };
const NBI = { code: 'TH-12', name: 'Nonthaburi', nameTh: 'นนทบุรี' };

/** The sample's three Bangkok sites, plus Sydney (placed) and a depot nobody has placed. */
function world(): { sites: SiteSummary[]; places: SitePlaces; id: (name: string) => string } {
  const ws = run(
    sample(),
    { type: 'project/create', id: 'p', name: 'Acme' },
    { type: 'site/create', projectId: 'p', id: 'syd', name: 'Sydney edge' },
    { type: 'site/locate', siteId: 'syd', location: { lat: -33.8688, lon: 151.2093 } },
    { type: 'site/create', projectId: 'p', id: 'depot', name: 'Depot 9' },
    { type: 'room/create', siteId: 'depot', id: 'r-depot', floorAreaId: 'fa-depot', name: 'Cage' },
  );
  const sites = siteSummaries(ws);
  const id = (name: string): string => sites.find((s) => s.site.name === name)!.site.id;
  const places: SitePlaces = new Map([
    [id('Bangna campus'), { country: TH, province: BKK }],
    [id('Riverside Campus'), { country: TH, province: BKK }],
    [id('Riverside Annex'), { country: TH, province: NBI }],
    [id('Sydney edge'), { country: AU, province: null }],
  ]);
  return { sites, places, id };
}
const siteNames = (sites: SiteSummary[] | null) => sites?.map((s) => s.site.name) ?? null;

describe('scope in the address', () => {
  it.each<[Scope, string | null]>([
    [{ kind: 'world' }, null],
    [{ kind: 'region', level: 'country', code: 'TH' }, 'country:TH'],
    [{ kind: 'region', level: 'province', code: 'TH-10' }, 'province:TH-10'],
    [{ kind: 'site', id: 'abc' }, 'site:abc'],
    [{ kind: 'sites', ids: ['a', 'b'] }, 'sites:a,b'],
  ])('writes %j as %s and reads it back', (scope, param) => {
    expect(scopeParam(scope)).toBe(param);
    expect(parseScope(param)).toEqual(scope);
  });

  it.each([null, '', 'nonsense', 'country:', 'sites:', 'planet:mars', 'country:th-10!'])('reads %j as the whole world', (param) => {
    expect(parseScope(param)).toEqual({ kind: 'world' });
  });
});

describe('which sites a scope holds', () => {
  it('holds every site on the world view, placed or not', () => {
    const { sites, places } = world();
    expect(siteNames(resolveScope({ kind: 'world' }, sites, places))).toEqual(['Bangna campus', 'Riverside Campus', 'Riverside Annex', 'Sydney edge', 'Depot 9']);
    // The world needs no map to know.
    expect(siteNames(resolveScope({ kind: 'world' }, sites, null))).toHaveLength(5);
  });

  it('holds a country’s or a province’s placed sites', () => {
    const { sites, places } = world();
    expect(siteNames(resolveScope({ kind: 'region', level: 'country', code: 'TH' }, sites, places))).toEqual(['Bangna campus', 'Riverside Campus', 'Riverside Annex']);
    expect(siteNames(resolveScope({ kind: 'region', level: 'province', code: 'TH-10' }, sites, places))).toEqual(['Bangna campus', 'Riverside Campus']);
    expect(siteNames(resolveScope({ kind: 'region', level: 'country', code: 'JP' }, sites, places))).toEqual([]);
  });

  it('cannot say which sites a region holds until the map has placed them', () => {
    const { sites } = world();
    expect(resolveScope({ kind: 'region', level: 'country', code: 'TH' }, sites, null)).toBeNull();
  });

  it('holds a cluster’s sites, or one site', () => {
    const { sites, places, id } = world();
    expect(siteNames(resolveScope({ kind: 'sites', ids: [id('Riverside Annex'), id('Bangna campus')] }, sites, places))).toEqual(['Bangna campus', 'Riverside Annex']);
    expect(siteNames(resolveScope({ kind: 'site', id: id('Depot 9') }, sites, null))).toEqual(['Depot 9']);
  });

  it('falls back to the world for sites that are gone', () => {
    const { sites, id } = world();
    expect(validScope({ kind: 'site', id: 'gone' }, sites)).toEqual({ kind: 'world' });
    expect(validScope({ kind: 'sites', ids: ['gone', 'also-gone'] }, sites)).toEqual({ kind: 'world' });
    expect(validScope({ kind: 'sites', ids: ['gone', id('Sydney edge')] }, sites)).toEqual({ kind: 'sites', ids: [id('Sydney edge')] });
    const thailand: Scope = { kind: 'region', level: 'country', code: 'TH' };
    expect(validScope(thailand, sites)).toBe(thailand);
  });
});

describe('naming a scope', () => {
  it('names places in the interface language', () => {
    expect(placeName(BKK, 'en')).toBe('Bangkok');
    expect(placeName(BKK, 'th')).toBe('กรุงเทพมหานคร');
    expect(placeName(TH, 'en')).toBe('Thailand');
    expect(placeName(TH, 'th')).toBe('ไทย');
  });

  it('labels each kind of scope', () => {
    const { sites, places, id } = world();
    expect(scopeLabel({ kind: 'world' }, sites, places, en, 'en')).toBe('Everywhere');
    expect(scopeLabel({ kind: 'region', level: 'country', code: 'TH' }, sites, places, en, 'en')).toBe('Thailand');
    expect(scopeLabel({ kind: 'region', level: 'province', code: 'TH-10' }, sites, places, th, 'th')).toBe('กรุงเทพมหานคร');
    expect(scopeLabel({ kind: 'site', id: id('Bangna campus') }, sites, places, en, 'en')).toBe('Bangna campus');
    expect(scopeLabel({ kind: 'sites', ids: [id('Bangna campus'), id('Riverside Annex')] }, sites, places, en, 'en')).toBe('Bangna campus, Riverside Annex');
    expect(scopeLabel({ kind: 'sites', ids: [id('Bangna campus'), id('Riverside Annex'), id('Riverside Campus')] }, sites, places, en, 'en')).toBe('Bangna campus and 2 more');
  });

  it('labels a region by its code until the map names it', () => {
    const { sites } = world();
    expect(scopeLabel({ kind: 'region', level: 'country', code: 'TH' }, sites, null, en, 'en')).toBe('Thailand');
    expect(scopeLabel({ kind: 'region', level: 'province', code: 'TH-10' }, sites, null, en, 'en')).toBe('TH-10');
  });
});
