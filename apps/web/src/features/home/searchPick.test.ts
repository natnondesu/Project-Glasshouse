import { apply, createWorkspace, withSample, type Workspace } from '@glasshouse/domain';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { siteSummaries } from '../globe/sites';
import { useHomeView } from './homeView';
import { queryWords } from './homeSearch';
import { pickOption } from './searchPick';
import { searchResults, type SearchOption } from './searchResults';

const sample = (): Workspace => {
  const r = withSample(createWorkspace(), '2026-10-18T00:00:00.000Z');
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
};
const ws = sample();
const sites = siteSummaries(ws);
const site = (name: string) => sites.find((s) => s.site.name === name)!;
const results = (q: string) => searchResults(sites, queryWords(q));
const go = (option: SearchOption, q = 'riverside') => {
  const ctx = { showRooms: vi.fn() };
  pickOption(option, results(q), ctx);
  return ctx;
};
const view = () => useHomeView.getState();

beforeEach(() => {
  view().reset();
  view().setFilter('draft');
});

describe('picking a search result', () => {
  it('a site: it becomes the scope (its card opens) and the globe flies to it', () => {
    go({ kind: 'site', site: site('Riverside Annex') });
    expect(view().scope).toEqual({ kind: 'site', id: site('Riverside Annex').site.id });
    expect(view().frame?.target).toEqual({ kind: 'site', id: site('Riverside Annex').site.id });
  });

  it('a site that isn’t on the map: its card opens, nothing flies', () => {
    const unplaced = apply(ws, { type: 'site/create', projectId: ws.projects[0]!.id, id: 's-new', name: 'Depot' });
    if (!unplaced.ok) throw new Error(unplaced.error.message);
    const depot = siteSummaries(unplaced.value).find((s) => s.site.id === 's-new')!;
    go({ kind: 'site', site: depot });
    expect(view().scope).toEqual({ kind: 'site', id: 's-new' });
    expect(view().frame).toBeNull();
  });

  it('a room: its site’s card opens with that room picked, and the globe flies to the site', () => {
    const shaft = site('Riverside Campus').rooms.find((r) => r.room.name === 'Shaft L2')!;
    go({ kind: 'room', room: shaft });
    expect(view().scope).toEqual({ kind: 'site', id: shaft.site.id });
    expect(view().cardRoom).toMatchObject({ siteId: shaft.site.id, roomId: shaft.room.id });
    expect(view().frame?.target).toEqual({ kind: 'site', id: shaft.site.id });
  });

  it('a project: its sites become the scope and the globe fits them', () => {
    const [hit] = results('riverside').projects.shown;
    go({ kind: 'project', project: hit! });
    const ids = [site('Riverside Campus').site.id, site('Riverside Annex').site.id];
    expect(view().scope).toEqual({ kind: 'sites', ids });
    expect(view().frame?.target).toEqual({ kind: 'points', ids });
  });

  it('Show all in Sites or Projects scopes to every site they hold', () => {
    go({ kind: 'more', group: 'sites', total: 3 }, 'sample');
    expect(view().scope).toEqual({ kind: 'sites', ids: sites.map((s) => s.site.id) });
    view().reset();
    go({ kind: 'more', group: 'projects', total: 2 }, 'sample');
    expect(view().scope).toEqual({ kind: 'sites', ids: sites.map((s) => s.site.id) });
  });

  it('Show all in Rooms opens the rooms out to everywhere and every chip, and goes to them', () => {
    view().setScope({ kind: 'site', id: site('Bangna campus').site.id });
    const ctx = go({ kind: 'more', group: 'rooms', total: 5 });
    expect(view().scope).toEqual({ kind: 'world' });
    expect(view().filter).toBe('all');
    expect(ctx.showRooms).toHaveBeenCalledOnce();
  });

  it('Show all on the map fits the matches without changing the scope', () => {
    go({ kind: 'map', ids: ['a', 'b'] });
    expect(view().scope).toEqual({ kind: 'world' });
    expect(view().frame?.target).toEqual({ kind: 'points', ids: ['a', 'b'] });
  });
});
