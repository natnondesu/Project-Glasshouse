import { apply, createWorkspace, withSample, type Workspace, type WorkspaceCommand } from '@glasshouse/domain';
import { describe, expect, it } from 'vitest';
import { siteSummaries } from '../globe/sites';
import { queryWords } from './homeSearch';
import { isEmpty, resultSections, searchResults, type SearchOption } from './searchResults';

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
const find = (ws: Workspace, query: string, cap?: number) => searchResults(siteSummaries(ws), queryWords(query), cap);
const label = (o: SearchOption): string => {
  switch (o.kind) {
    case 'site':
      return `site ${o.site.site.name}`;
    case 'room':
      return `room ${o.room.room.name}`;
    case 'project':
      return `project ${o.project.project.name}`;
    case 'more':
      return `more ${o.group} ${o.total}`;
    case 'map':
      return `map ${o.ids.length}`;
  }
};
const options = (ws: Workspace, query: string, cap?: number) => resultSections(find(ws, query, cap)).map((s) => `${s.group}: ${s.options.map(label).join(', ')}`);

describe('grouping search results for the dropdown', () => {
  it('lists sites, rooms and projects the search keeps, then the way to see them on the map', () => {
    expect(options(sample(), 'riverside')).toEqual([
      'sites: site Riverside Campus, site Riverside Annex',
      'rooms: room Server Room, room Shaft L1, room Shaft L2, room Shaft L3, room Comms Room',
      'projects: project Sample · Riverside Campus',
      'map: map 2',
    ]);
  });

  it('puts the best name match first in each group: the whole name, then its start, then a word in it', () => {
    expect(options(sample(), 'server room')).toEqual(['rooms: room Server Room, room Server room A', 'map: map 2']);
    // Riverside Annex is listed too, by its project's name, after the two named so.
    expect(options(sample(), 'campus').slice(0, 1)).toEqual(['sites: site Bangna campus, site Riverside Campus, site Riverside Annex']);
  });

  it('lists a site only by its own or its project’s names, never just for holding a matching room', () => {
    const r = find(sample(), 'shaft');
    expect(r.sites.all).toEqual([]);
    expect(r.rooms.shown.map((x) => x.room.name)).toEqual(['Shaft L1', 'Shaft L2', 'Shaft L3']);
    expect(r.projects.all).toEqual([]);
    expect(r.onMap).toHaveLength(1);
  });

  it('caps each group and offers the rest, counting all of it', () => {
    expect(options(sample(), 'riverside', 3)).toEqual([
      'sites: site Riverside Campus, site Riverside Annex',
      'rooms: room Server Room, room Shaft L1, room Shaft L2, more rooms 5',
      'projects: project Sample · Riverside Campus',
      'map: map 2',
    ]);
    expect(options(sample(), 'sample', 1)[0]).toBe('sites: site Bangna campus, more sites 3');
  });

  it('counts a project’s sites and rooms, and knows which sites they are', () => {
    const [hit] = find(sample(), 'riverside').projects.shown;
    expect(hit).toMatchObject({ sites: 2, rooms: 5 });
    expect(hit!.siteIds).toHaveLength(2);
  });

  it('matches Thai without tone marks, and leaves a site that isn’t on the map out of the map’s count', () => {
    const ws = run(
      sample(),
      { type: 'project/create', id: 'p-th', name: 'ศูนย์ข้อมูล บางนา' },
      { type: 'site/create', projectId: 'p-th', id: 's-th', name: 'อาคารสำนักงานใหญ่' },
      { type: 'room/create', siteId: 's-th', id: 'r-th', floorAreaId: 'fa-th', name: 'ห้องเซิร์ฟเวอร์ ชั้น 3' },
    );
    expect(options(ws, 'หองเซิรฟเวอร')).toEqual(['rooms: room ห้องเซิร์ฟเวอร์ ชั้น 3']);
    expect(options(ws, 'ศูนยขอมูล')).toEqual(['sites: site อาคารสำนักงานใหญ่', 'rooms: room ห้องเซิร์ฟเวอร์ ชั้น 3', 'projects: project ศูนย์ข้อมูล บางนา']);
  });

  it('says when nothing matches', () => {
    const r = find(sample(), 'xyz');
    expect(isEmpty(r)).toBe(true);
    expect(resultSections(r)).toEqual([]);
    expect(isEmpty(find(sample(), 'mdf'))).toBe(false);
    expect(isEmpty(find(sample(), ''))).toBe(true);
  });
});
