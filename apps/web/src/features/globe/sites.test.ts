import { apply, createWorkspace, withSample, type Workspace, type WorkspaceCommand } from '@glasshouse/domain';
import { describe, expect, it } from 'vitest';
import { notPlaced, placed, siteSummaries } from './sites';

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
const byName = (ws: Workspace, name: string) => siteSummaries(ws).find((s) => s.site.name === name)!;

describe('siteSummaries', () => {
  it('totals each site: rooms, racks, planned power against the limits, and what holds approval', () => {
    const bangna = byName(sample(), 'Bangna campus');
    expect(bangna.project.name).toBe('Sample · Northgate DC');
    expect(bangna.rooms.map((r) => r.room.name)).toEqual(['Server room A', 'MDF-1']);
    expect(bangna.racks).toBe(bangna.rooms.reduce((n, r) => n + r.racks, 0));
    expect(bangna.knownW).toBe(bangna.rooms.reduce((n, r) => n + r.knownW, 0));
    expect(bangna.limitW).toBe(bangna.rooms.reduce((n, r) => n + r.limitW, 0));
    // Server room A is approved (nothing holds it); MDF-1 has one blocking and one to acknowledge.
    expect(bangna.holds).toEqual({ blocks: 1, needsAck: 1 });
    expect(bangna.isSample).toBe(true);
    expect(bangna.location).toEqual({ lat: 13.668, lon: 100.605 });
  });

  it('counts power it does not know instead of calling it zero', () => {
    const campus = byName(sample(), 'Riverside Campus');
    expect(campus.unknownDemand).toBeGreaterThan(0);
  });

  it('lists a site with no rooms yet', () => {
    const ws = run(createWorkspace(), { type: 'project/create', id: 'p', name: 'P' }, { type: 'site/create', projectId: 'p', id: 's', name: 'Empty lot' });
    expect(siteSummaries(ws)).toMatchObject([{ site: { name: 'Empty lot' }, rooms: [], racks: 0, knownW: 0, limitW: 0 }]);
  });

  it('leaves out archived sites, sites in archived projects, and archived rooms', () => {
    const ws = sample();
    const annex = byName(ws, 'Riverside Annex');
    const bangna = byName(ws, 'Bangna campus');
    const mdf = bangna.rooms.find((r) => r.room.name === 'MDF-1')!;
    const after = run(ws, { type: 'site/archive', siteId: annex.site.id, by: '', at: AT }, { type: 'room/archive', roomId: mdf.room.id, by: '', at: AT });
    expect(siteSummaries(after).map((s) => s.site.name)).not.toContain('Riverside Annex');
    expect(byName(after, 'Bangna campus').rooms.map((r) => r.room.name)).toEqual(['Server room A']);
    const gone = run(ws, { type: 'project/archive', projectId: bangna.project.id, by: '', at: AT });
    expect(siteSummaries(gone).map((s) => s.site.name)).not.toContain('Bangna campus');
  });
});

describe('placed and not placed', () => {
  it('splits sites by whether they have a location, so none disappears from Home', () => {
    const ws = run(sample(), { type: 'project/create', id: 'p', name: 'Acme' }, { type: 'site/create', projectId: 'p', id: 's', name: 'Warehouse 2' });
    const all = siteSummaries(ws);
    expect(placed(all).map((s) => s.site.name).sort()).toEqual(['Bangna campus', 'Riverside Annex', 'Riverside Campus']);
    expect(notPlaced(all).map((s) => s.site.name)).toEqual(['Warehouse 2']);
    expect(placed(all).length + notPlaced(all).length).toBe(all.length);
  });
});
