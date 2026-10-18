import { beforeEach, describe, expect, it } from 'vitest';
import { resetWorkspaceStore, useWorkspaceStore } from '../../store/workspaceStore';
import { filterSites, needsFilter, switcherSites } from './switcher';

const AT = '2026-10-18T09:00:00.000Z';
const send = (command: Parameters<ReturnType<typeof useWorkspaceStore.getState>['dispatch']>[0]) => {
  const problem = useWorkspaceStore.getState().dispatch(command);
  if (problem) throw new Error(problem.message);
};
const project = () => useWorkspaceStore.getState().workspace.projects.find((p) => p.id === 'p')!;
const names = (sites: ReturnType<typeof switcherSites>) => sites.map((s) => [s.name, s.rooms.map((r) => r.name)]);

beforeEach(() => {
  resetWorkspaceStore();
  send({ type: 'project/create', id: 'p', name: 'Northgate' });
  send({ type: 'site/create', projectId: 'p', id: 'a', name: 'Bangna campus' });
  send({ type: 'site/create', projectId: 'p', id: 'b', name: 'Annex' });
  send({ type: 'site/create', projectId: 'p', id: 'empty', name: 'Empty site' });
  send({ type: 'room/create', siteId: 'a', id: 'r1', floorAreaId: 'f1', name: 'Server room A' });
  send({ type: 'room/create', siteId: 'a', id: 'r2', floorAreaId: 'f2', name: 'MDF-1' });
  send({ type: 'room/create', siteId: 'b', id: 'r3', floorAreaId: 'f3', name: 'Comms room' });
});

describe('switcherSites', () => {
  it('groups the project rooms by site in tree order and marks the current room', () => {
    const sites = switcherSites(project(), 'r2');
    expect(names(sites)).toEqual([
      ['Bangna campus', ['Server room A', 'MDF-1']],
      ['Annex', ['Comms room']],
    ]);
    expect(sites[0]!.rooms.map((r) => r.current)).toEqual([false, true]);
  });

  it('carries each room revision as the tree shows it', () => {
    send({ type: 'review', roomId: 'r1', command: { type: 'review/submit', designedBy: '', at: AT } });
    const [first] = switcherSites(project(), 'r2');
    expect(first!.rooms[0]).toMatchObject({ number: 1, state: 'in_review' });
    expect(first!.rooms[1]).toMatchObject({ number: 1, state: 'draft' });
  });

  it('leaves out archived rooms and sites, and sites with nothing to open', () => {
    send({ type: 'room/archive', roomId: 'r2', by: '', at: AT });
    send({ type: 'site/archive', siteId: 'b', by: '', at: AT });
    expect(names(switcherSites(project(), 'r1'))).toEqual([['Bangna campus', ['Server room A']]]);
  });

  it('keeps the current room even when it is archived, alone in an archived site', () => {
    send({ type: 'room/create', siteId: 'b', id: 'r4', floorAreaId: 'f4', name: 'Hidden' });
    send({ type: 'site/archive', siteId: 'b', by: '', at: AT });
    expect(names(switcherSites(project(), 'r3'))).toEqual([
      ['Bangna campus', ['Server room A', 'MDF-1']],
      ['Annex', ['Comms room']],
    ]);
  });

  it('shows only the current room of an archived project', () => {
    send({ type: 'project/archive', projectId: 'p', by: '', at: AT });
    expect(names(switcherSites(project(), 'r1'))).toEqual([['Bangna campus', ['Server room A']]]);
  });
});

describe('filterSites', () => {
  it('keeps rooms whose name or site matches every word, case-insensitively', () => {
    const sites = switcherSites(project(), 'r1');
    expect(names(filterSites(sites, 'mdf'))).toEqual([['Bangna campus', ['MDF-1']]]);
    expect(names(filterSites(sites, 'annex'))).toEqual([['Annex', ['Comms room']]]);
    expect(names(filterSites(sites, 'room bangna'))).toEqual([['Bangna campus', ['Server room A']]]);
    expect(filterSites(sites, 'nothing like it')).toEqual([]);
  });

  it('returns everything for a blank query', () => {
    const sites = switcherSites(project(), 'r1');
    expect(filterSites(sites, '   ')).toEqual(sites);
  });
});

describe('needsFilter', () => {
  it('offers the filter only past eight rooms', () => {
    const many = (n: number) => [{ id: 's', name: 'S', rooms: Array.from({ length: n }, (_, i) => ({ id: `r${i}`, name: `R${i}`, number: 1, state: 'draft' as const, current: false })) }];
    expect(needsFilter(many(8))).toBe(false);
    expect(needsFilter(many(9))).toBe(true);
  });
});
