import { describe, expect, it } from 'vitest';
import { applyPlanCommand } from './commands/plan';
import { emptyContent } from './factories';
import { feedRoute, nextFeedLabel } from './feeds';
import { migrate } from './migrations';
import type { PlanContent, Rack, RoomObject } from './model/types';
import { createObject } from './objects';

// A 6 × 5 m room; the MCB hangs on the left wall, the rack faces down with its rear 2 m from the top wall.
function room(): PlanContent {
  const mcb: RoomObject = { ...createObject('mcb', { x: 0, y: 2.4 }, []), id: 'mcb', name: 'MCB-01', angle: 90, w: 0.5, d: 0.2 };
  const rack: Rack = { ...(createObject('rack', { x: 3, y: 2 }, []) as Rack), id: 'rk', name: 'RK-01' };
  let c: PlanContent = { ...emptyContent(), survey: { ...emptyContent().survey, width: 6, length: 5, floorAreas: [{ id: 'a', x: 0, y: 0, w: 6, d: 5 }] } };
  for (const object of [mcb, rack]) {
    const r = applyPlanCommand(c, { type: 'object/add', object });
    if (!r.ok) throw new Error(r.error.message);
    c = r.value;
  }
  return c;
}
function add(c: PlanContent, id: string, label = nextFeedLabel(c, 'rk')): PlanContent {
  const r = applyPlanCommand(c, { type: 'feed/add', feed: { id, rackId: 'rk', sourceId: 'mcb', label } });
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
}

describe('power feeds', () => {
  it('connects a rack to an MCB panel; a rack can have several feeds, labelled A, B…', () => {
    let c = room();
    expect(nextFeedLabel(c, 'rk')).toBe('Feed A');
    c = add(c, 'f1');
    c = add(c, 'f2');
    expect(c.feeds.map((f) => f.label)).toEqual(['Feed A', 'Feed B']);
  });

  it('only connects a rack to an MCB panel', () => {
    const c = room();
    expect(applyPlanCommand(c, { type: 'feed/add', feed: { id: 'f', rackId: 'mcb', sourceId: 'rk', label: 'Feed A' } })).toMatchObject({
      ok: false,
      error: { message: 'Power feeds run from an MCB panel to a rack.' },
    });
  });

  it('goes when its rack or its panel is removed, and can be relabelled or removed', () => {
    let c = add(room(), 'f1');
    const relabelled = applyPlanCommand(c, { type: 'feed/update', id: 'f1', patch: { label: 'UPS A' } });
    if (!relabelled.ok) throw new Error(relabelled.error.message);
    expect(relabelled.value.feeds[0]!.label).toBe('UPS A');
    const noPanel = applyPlanCommand(c, { type: 'object/remove', id: 'mcb' });
    expect(noPanel.ok && noPanel.value.feeds).toEqual([]);
    c = add(c, 'f2');
    const removed = applyPlanCommand(c, { type: 'feed/remove', id: 'f1' });
    expect(removed.ok && removed.value.feeds.map((f) => f.id)).toEqual(['f2']);
  });

  it('routes down the wall from the panel, along the wall inside the room, then across to the rack rear', () => {
    const c = add(room(), 'f1');
    const route = feedRoute(c, c.feeds[0]!)!;
    const [start, ...rest] = route;
    expect(start![0]).toBeCloseTo(0.1, 6);
    expect(start![1]).toBeCloseTo(2.65, 6);
    const end = rest[rest.length - 1]!;
    expect(end).toEqual([3.3, 2]);
    // Shorter way round: up the left wall, along the top wall, kept just inside the room.
    const corner = rest.find(([x, y]) => x < 0.3 && y < 0.3);
    expect(corner).toBeDefined();
    expect(rest.every(([x, y]) => x > 0 && y > 0)).toBe(true);
  });

  it('enters the rack at separate points when it has several feeds', () => {
    let c = add(room(), 'f1');
    c = add(c, 'f2');
    const ends = c.feeds.map((f) => feedRoute(c, f)!.at(-1)!);
    expect(ends[0]![0]).not.toBeCloseTo(ends[1]![0], 3);
    expect(ends[0]![1]).toBeCloseTo(2, 6);
  });

  it('gives each feed its own lane so parallel runs stay apart', () => {
    let c = add(room(), 'f1');
    c = add(c, 'f2');
    const a = feedRoute(c, c.feeds[0]!)!;
    const b = feedRoute(c, c.feeds[1]!)!;
    expect(a[1]![0]).not.toBeCloseTo(b[1]![0], 3);
  });

  it('upgrades schema 2 data by giving every revision an empty feed list', () => {
    const raw = { schemaVersion: 2, catalog: [], lastBackupAt: null, projects: [{ id: 'p', name: 'P', notes: '', isSample: false, sites: [{ id: 's', name: 'S', notes: '', rooms: [{ id: 'r', name: 'R', notes: '', plan: { notes: [], history: [], revisions: [{ content: {} }] } }] }] }] };
    const m = migrate(raw);
    expect(m.ok && (m.value as typeof raw).projects[0]!.sites[0]!.rooms[0]!.plan.revisions[0]!.content).toEqual({ feeds: [] });
  });
});
