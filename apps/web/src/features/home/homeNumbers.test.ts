import { apply, createWorkspace, withSample, type Workspace, type WorkspaceCommand } from '@glasshouse/domain';
import { describe, expect, it } from 'vitest';
import { siteSummaries } from '../globe/sites';
import { homeNumbers, kw, powerShare } from './homeNumbers';
import { narrowSites, queryWords } from './homeSearch';

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

describe('the numbers for a scope', () => {
  it('totals rooms by state, racks and devices, power against the limits, and what holds approval', () => {
    const n = homeNumbers(siteSummaries(sample()));
    expect(n).toMatchObject({
      sites: 3,
      unplaced: 0,
      rooms: 7,
      approved: 2,
      draft: 5,
      inReview: 0,
      racks: 18,
      devices: 66,
      knownW: 35_260,
      limitW: 68_800,
      unknownDemand: 2,
      blocks: 3,
      needsAck: 2,
      roomsHeld: 2,
    });
  });

  it('counts only the sites and rooms it is given (one site)', () => {
    const bangna = siteSummaries(sample()).filter((s) => s.site.name === 'Bangna campus');
    expect(homeNumbers(bangna)).toMatchObject({ sites: 1, rooms: 2, approved: 1, draft: 1, racks: 6, devices: 14, knownW: 6080, limitW: 10_400, blocks: 1, needsAck: 1, roomsHeld: 1 });
  });

  it('counts what a search keeps', () => {
    const n = homeNumbers(narrowSites(siteSummaries(sample()), queryWords('shaft')));
    expect(n).toMatchObject({ sites: 1, rooms: 3, approved: 1, draft: 2, racks: 3, blocks: 0, roomsHeld: 0 });
  });

  it('says how many sites in it have no location, and counts sites without rooms', () => {
    const ws = run(sample(), { type: 'project/create', id: 'p', name: 'Acme' }, { type: 'site/create', projectId: 'p', id: 's', name: 'Empty lot' });
    expect(homeNumbers(siteSummaries(ws))).toMatchObject({ sites: 4, unplaced: 1, rooms: 7 });
  });

  it('names the room when exactly one holds approval, so its count can lead straight there', () => {
    const sites = siteSummaries(sample());
    const bangna = sites.filter((s) => s.site.name === 'Bangna campus');
    expect(homeNumbers(bangna).heldRoomId).toBe(bangna[0]!.rooms.find((r) => r.room.name === 'MDF-1')!.room.id);
    expect(homeNumbers(sites).heldRoomId).toBeNull();
  });

  it('is all zero for nothing', () => {
    expect(homeNumbers([])).toMatchObject({ sites: 0, rooms: 0, racks: 0, knownW: 0, limitW: 0, blocks: 0, roomsHeld: 0, heldRoomId: null });
  });

  it('counts in-review rooms apart from drafts', () => {
    const ws = sample();
    const mdf = siteSummaries(ws).flatMap((s) => s.rooms).find((r) => r.room.name === 'Shaft L2')!;
    const submitted = run(ws, { type: 'review', roomId: mdf.room.id, command: { type: 'review/submit', designedBy: 'Ploy', at: AT } });
    expect(homeNumbers(siteSummaries(submitted))).toMatchObject({ approved: 2, draft: 4, inReview: 1 });
  });
});

describe('the power share', () => {
  it('rounds to a whole percent of the limits', () => {
    expect(powerShare(35_260, 68_800)).toEqual({ pct: 51, over: false });
  });

  it('says when the plan is over the limits, and has no share without limits', () => {
    expect(powerShare(5000, 4000)).toEqual({ pct: 125, over: true });
    expect(powerShare(5000, 0)).toBeNull();
  });
});

describe('kilowatts', () => {
  it('says a scope’s power in kW with one decimal', () => {
    expect(kw(35_260)).toBe('35.3');
    expect(kw(68_800)).toBe('68.8');
    expect(kw(0)).toBe('0.0');
    expect(kw(1_234_560)).toBe('1,234.6');
  });
});
