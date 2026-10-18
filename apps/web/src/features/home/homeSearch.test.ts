import { apply, createWorkspace, withSample, type Workspace, type WorkspaceCommand } from '@glasshouse/domain';
import { describe, expect, it } from 'vitest';
import { siteSummaries } from '../globe/sites';
import { fold, narrowSites, queryWords, topMatch } from './homeSearch';

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
const withThai = (): Workspace =>
  run(
    sample(),
    { type: 'project/create', id: 'p-th', name: 'ศูนย์ข้อมูล บางนา' },
    { type: 'site/create', projectId: 'p-th', id: 's-th', name: 'อาคารสำนักงานใหญ่' },
    { type: 'room/create', siteId: 's-th', id: 'r-th', floorAreaId: 'fa-th', name: 'ห้องเซิร์ฟเวอร์ ชั้น 3' },
    { type: 'project/create', id: 'p-fr', name: 'Café Rénové' },
    { type: 'site/create', projectId: 'p-fr', id: 's-fr', name: 'Entrepôt Nord' },
    { type: 'room/create', siteId: 's-fr', id: 'r-fr', floorAreaId: 'fa-fr', name: 'Salle serveur' },
  );
const names = (sites: ReturnType<typeof siteSummaries>) => sites.map((s) => `${s.site.name}: ${s.rooms.map((r) => r.room.name).join(', ')}`);

describe('folding text for search', () => {
  it('ignores case and Latin accents', () => {
    expect(fold('Café RÉNOVÉ')).toBe('cafe renove');
  });

  it('keeps Thai letters, so Thai names stay searchable with or without tone marks', () => {
    expect(fold('ห้องเซิร์ฟเวอร์')).toBe(fold('ห้องเซิรฟเวอร'));
    expect(fold('ห้องเซิร์ฟเวอร์')).toContain('หอง');
  });

  it('splits a query into folded words and drops empty ones', () => {
    expect(queryWords('  Server   ROOM ')).toEqual(['server', 'room']);
    expect(queryWords('   ')).toEqual([]);
  });
});

describe('narrowing sites and rooms to a search', () => {
  it('keeps everything when there is no query', () => {
    const sites = siteSummaries(sample());
    expect(narrowSites(sites, [])).toBe(sites);
  });

  it('keeps only the rooms whose project, site or room name holds every word', () => {
    const sites = siteSummaries(sample());
    expect(names(narrowSites(sites, queryWords('mdf')))).toEqual(['Bangna campus: MDF-1']);
    // A site's name matches all of its rooms.
    expect(names(narrowSites(sites, queryWords('annex')))).toEqual(['Riverside Annex: Comms Room']);
    // Words can come from different levels: the site and the room.
    expect(names(narrowSites(sites, queryWords('riverside shaft l2')))).toEqual(['Riverside Campus: Shaft L2']);
    expect(narrowSites(sites, queryWords('nothing like this'))).toEqual([]);
  });

  it('finds Thai names and accented names whichever way they are typed', () => {
    const sites = siteSummaries(withThai());
    expect(names(narrowSites(sites, queryWords('เซิร์ฟเวอร์')))).toEqual(['อาคารสำนักงานใหญ่: ห้องเซิร์ฟเวอร์ ชั้น 3']);
    expect(names(narrowSites(sites, queryWords('บางนา')))).toEqual(['อาคารสำนักงานใหญ่: ห้องเซิร์ฟเวอร์ ชั้น 3']);
    expect(names(narrowSites(sites, queryWords('cafe')))).toEqual(['Entrepôt Nord: Salle serveur']);
    expect(names(narrowSites(sites, queryWords('ENTREPOT')))).toEqual(['Entrepôt Nord: Salle serveur']);
  });

  it('keeps a site whose name matches even when it has no rooms yet', () => {
    const ws = run(sample(), { type: 'project/create', id: 'p', name: 'Acme' }, { type: 'site/create', projectId: 'p', id: 's', name: 'Empty lot' });
    expect(names(narrowSites(siteSummaries(ws), queryWords('empty')))).toEqual(['Empty lot: ']);
  });

  it('never changes the sites it was given', () => {
    const sites = siteSummaries(sample());
    const before = sites.map((s) => s.rooms.length);
    narrowSites(sites, queryWords('mdf'));
    expect(sites.map((s) => s.rooms.length)).toEqual(before);
  });
});

describe('the top match, for Enter', () => {
  it('is a room when a room name matches best', () => {
    const top = topMatch(siteSummaries(sample()), queryWords('mdf'));
    expect(top?.kind).toBe('room');
    expect(top?.kind === 'room' && top.room.room.name).toBe('MDF-1');
  });

  it('is the site when the site name matches better than any room', () => {
    const top = topMatch(siteSummaries(sample()), queryWords('riverside campus'));
    expect(top?.kind === 'site' && top.site.site.name).toBe('Riverside Campus');
  });

  it('prefers an exact room name over one that only starts with the words', () => {
    const top = topMatch(siteSummaries(sample()), queryWords('shaft l2'));
    expect(top?.kind === 'room' && top.room.room.name).toBe('Shaft L2');
  });

  it('is nothing without a query or a match', () => {
    expect(topMatch(siteSummaries(sample()), [])).toBeNull();
    expect(topMatch(siteSummaries(sample()), queryWords('zzz'))).toBeNull();
  });
});
