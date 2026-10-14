import { describe, expect, it } from 'vitest';
import { applyPlanCommand } from './commands/plan';
import { emptyContent } from './factories';
import { feedIssues } from './checks/feeds';
import { feedRoute, loadA, nextFeedLabel, upstreamOf } from './feeds';
import { centerOf } from './geometry/polygon';
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
  const r = applyPlanCommand(c, { type: 'feed/add', feed: { id, targetId: 'rk', sourceId: 'mcb', label } });
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

  it('runs from a power source to a rack or another power source', () => {
    const c = room();
    expect(applyPlanCommand(c, { type: 'feed/add', feed: { id: 'f', targetId: 'mcb', sourceId: 'rk', label: 'Feed A' } })).toMatchObject({
      ok: false,
      error: { message: 'Power feeds run from a power source to a rack or another power source.' },
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
    expect(m.ok && (m.value as typeof raw).projects[0]!.sites[0]!.rooms[0]!.plan.revisions[0]!.content).toMatchObject({ feeds: [] });
  });
});

describe('power chains', () => {
  // MCB on the wall feeds a UPS on the floor, which feeds a PDU, which feeds the rack.
  function chain(): PlanContent {
    let c = room();
    for (const object of [
      { ...createObject('ups', { x: 1, y: 4 }, []), id: 'ups', name: 'UPS-01' },
      { ...createObject('pdu', { x: 2, y: 4 }, []), id: 'pdu', name: 'PDU-01' },
    ] as RoomObject[]) {
      const r = applyPlanCommand(c, { type: 'object/add', object });
      if (!r.ok) throw new Error(r.error.message);
      c = r.value;
    }
    return c;
  }
  const feed = (c: PlanContent, id: string, sourceId: string, targetId: string, extra: { way?: number } = {}) =>
    applyPlanCommand(c, { type: 'feed/add', feed: { id, targetId, sourceId, label: nextFeedLabel(c, targetId), ...extra } });
  const must = (r: ReturnType<typeof feed>): PlanContent => {
    if (!r.ok) throw new Error(r.error.message);
    return r.value;
  };

  it('feeds a source from another source', () => {
    let c = must(feed(chain(), 'a', 'mcb', 'ups'));
    c = must(feed(c, 'b', 'ups', 'pdu'));
    c = must(feed(c, 'c', 'pdu', 'rk'));
    expect(upstreamOf(c, 'rk').map((o) => o.name)).toEqual(['PDU-01', 'UPS-01', 'MCB-01']);
  });

  it('gives a source one input, and refuses loops and self-feeds', () => {
    let c = must(feed(chain(), 'a', 'mcb', 'ups'));
    c = must(feed(c, 'b', 'ups', 'pdu'));
    expect(feed(c, 'x', 'mcb', 'pdu')).toMatchObject({ ok: false, error: { message: 'PDU-01 is already fed from UPS-01.' } });
    expect(feed(c, 'y', 'pdu', 'mcb')).toMatchObject({ ok: false, error: { message: 'That would loop power back into PDU-01: MCB-01 already feeds it.' } });
    expect(feed(c, 'z', 'ups', 'ups')).toMatchObject({ ok: false, error: { message: 'A power source can\'t feed itself.' } });
    expect(applyPlanCommand(c, { type: 'feed/update', id: 'a', patch: { sourceId: 'pdu' } })).toMatchObject({ ok: false });
  });

  it('rolls downstream racks up into the feed that powers a source', () => {
    let c = must(feed(chain(), 'a', 'mcb', 'ups', { way: 1 }));
    c = must(feed(c, 'b', 'ups', 'rk'));
    expect(loadA(c, 'ups')).toBe(0);
    const rack = c.objects.find((o) => o.id === 'rk') as Rack;
    const heavy: Rack = { ...rack, reserved: [{ id: 'rs', label: 'Load', bottomU: 1, heightU: 10, demand: { kind: 'known', watts: 4600 }, notes: '' }] };
    c = { ...c, objects: c.objects.map((o) => (o.id === 'rk' ? heavy : o)) };
    expect(loadA(c, 'ups')).toBeCloseTo(20);
    expect(feedIssues(c).map((i) => i.message)).toContain('Feed A of UPS-01 needs 20.0 A at 230 V, but MCB-01 way 1 is rated 16 A.');
  });

  it('routes into a source, ending at it', () => {
    const c = must(feed(chain(), 'a', 'mcb', 'ups'));
    const route = feedRoute(c, c.feeds[0]!)!;
    expect(route[route.length - 1]).toEqual(centerOf(c.objects.find((o) => o.id === 'ups')!));
  });

  it('upgrades schema 4 feeds from rackId to targetId', () => {
    const m = migrate({ schemaVersion: 4, catalog: [], lastBackupAt: null, projects: [{ sites: [{ rooms: [{ plan: { revisions: [{ content: { feeds: [{ id: 'f', rackId: 'rk', sourceId: 's', label: 'Feed A' }] } }] } }] }] }] });
    expect(JSON.stringify(m.ok && m.value)).toContain('"targetId":"rk"');
    expect(JSON.stringify(m.ok && m.value)).not.toContain('rackId');
  });
});
