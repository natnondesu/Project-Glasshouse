import { describe, expect, it } from 'vitest';
import { checkPlan } from './checks';
import { applyPlanCommand, type PlanCommand } from './commands/plan';
import { emptyContent } from './factories';
import { feedRoute } from './feeds';
import { centerOf, localToWorld } from './geometry/polygon';
import type { PlanContent, Rack, RoomObject, Template } from './model/types';
import { createObject } from './objects';
import { isPowerSource, panelOf, wayPhase } from './sources';
import { seedTemplates } from './catalog';

function run(c: PlanContent, ...cmds: PlanCommand[]): PlanContent {
  return cmds.reduce((acc, cmd) => {
    const r = applyPlanCommand(acc, cmd);
    if (!r.ok) throw new Error(r.error.message);
    return r.value;
  }, c);
}
const rack = (): Rack => ({ ...(createObject('rack', { x: 2, y: 1.5 }, []) as Rack), id: 'rk', name: 'RK-01' });
const mcb = (): RoomObject => ({ ...createObject('mcb', { x: 0, y: 1 }, []), id: 'mcb', name: 'MCB-01', angle: 90 });
const server = seedTemplates().find((t) => t.id === 'tpl-server-4u') as Template;

describe('power source types', () => {
  it('creates every source type with its own name and size', () => {
    const names = (['wall_plug', 'industrial_socket', 'floor_box', 'ups', 'pdu'] as const).map((t) => createObject(t, { x: 1, y: 1 }, []).name);
    expect(names).toEqual(['WP-01', 'IS-01', 'FB-01', 'UPS-01', 'PDU-01']);
    expect(isPowerSource(createObject('ups', { x: 0, y: 0 }, []))).toBe(true);
    expect(isPowerSource(createObject('furniture', { x: 0, y: 0 }, []))).toBe(false);
  });

  it('feeds a rack from any source; floor-standing sources run straight across the floor', () => {
    const ups: RoomObject = { ...createObject('ups', { x: 4, y: 3 }, []), id: 'ups', name: 'UPS-01' };
    const c = run({ ...emptyContent(), objects: [] }, { type: 'object/add', object: rack() }, { type: 'object/add', object: ups }, { type: 'feed/add', feed: { id: 'f', targetId: 'rk', sourceId: 'ups', label: 'Feed A' } });
    const route = feedRoute(c, c.feeds[0]!)!;
    const r = c.objects[0] as Rack;
    expect(route).toEqual([centerOf(ups), [localToWorld(r, [0, -r.d / 2])[0], centerOf(ups)[1]], localToWorld(r, [0, -r.d / 2])]);
  });

  it('lets wall plugs and floor boxes sit in a rack clearance without blocking approval', () => {
    const plug: RoomObject = { ...createObject('wall_plug', { x: 2.2, y: 0 }, []), id: 'wp' };
    const box: RoomObject = { ...createObject('floor_box', { x: 2.1, y: 2.8 }, []), id: 'fb' };
    const c = run(emptyContent(), { type: 'object/add', object: rack() }, { type: 'object/add', object: plug }, { type: 'object/add', object: box });
    expect(checkPlan(c).filter((i) => i.severity === 'block')).toEqual([]);
  });
});

describe('MCB panel ways', () => {
  const base = () => run(emptyContent(), { type: 'object/add', object: rack() }, { type: 'object/add', object: mcb() }, { type: 'feed/add', feed: { id: 'f', targetId: 'rk', sourceId: 'mcb', label: 'Feed A' } });

  it('starts as a three-phase, 12-way panel at 16 A with phases rotating L1–L3', () => {
    const panel = panelOf(base().objects.find((o) => o.id === 'mcb')!);
    expect(panel.phase).toBe('three');
    expect(panel.ways).toHaveLength(12);
    expect(panel.ways.every((w) => w.ratingA === 16)).toBe(true);
    expect([1, 2, 3, 4].map((n) => wayPhase(panel, n))).toEqual(['L1', 'L2', 'L3', 'L1']);
    expect(wayPhase({ ...panel, phase: 'single' }, 4)).toBe('L');
  });

  it('assigns a feed to one way only, and only on its own MCB', () => {
    let c = run(base(), { type: 'feed/update', id: 'f', patch: { way: 3 } });
    expect(c.feeds[0]!.way).toBe(3);
    c = run(c, { type: 'feed/add', feed: { id: 'g', targetId: 'rk', sourceId: 'mcb', label: 'Feed B' } });
    expect(applyPlanCommand(c, { type: 'feed/update', id: 'g', patch: { way: 3 } })).toMatchObject({ ok: false, error: { message: 'Way 3 on MCB-01 already has Feed A of RK-01.' } });
    expect(applyPlanCommand(c, { type: 'feed/update', id: 'g', patch: { way: 13 } })).toMatchObject({ ok: false, error: { message: 'MCB-01 has ways 1 to 12.' } });
    c = run(c, { type: 'feed/update', id: 'f', patch: { way: null } });
    expect(c.feeds[0]!.way).toBeUndefined();
  });

  it('configures the panel; it cannot drop a way that has a feed', () => {
    let c = run(base(), { type: 'feed/update', id: 'f', patch: { way: 10 } });
    expect(applyPlanCommand(c, { type: 'panel/configure', id: 'mcb', patch: { wayCount: 6 } })).toMatchObject({ ok: false, error: { message: 'Way 10 has Feed A of RK-01. Move it before removing ways.' } });
    c = run(c, { type: 'panel/configure', id: 'mcb', patch: { wayCount: 18, phase: 'single' } }, { type: 'panel/way', id: 'mcb', way: 10, patch: { ratingA: 32, label: 'Rack row 1' } });
    const panel = panelOf(c.objects.find((o) => o.id === 'mcb')!);
    expect(panel).toMatchObject({ phase: 'single' });
    expect(panel.ways).toHaveLength(18);
    expect(panel.ways[9]).toEqual({ ratingA: 32, label: 'Rack row 1' });
    expect(applyPlanCommand(c, { type: 'panel/way', id: 'mcb', way: 1, patch: { ratingA: 0 } })).toMatchObject({ ok: false });
  });

  it('warns when a feed has no way, and when the rack needs more current than its way allows', () => {
    let c = base();
    expect(checkPlan(c).map((i) => i.code)).toContain('feed_no_way');
    c = run(c, { type: 'feed/update', id: 'f', patch: { way: 1 } }, { type: 'panel/way', id: 'mcb', way: 1, patch: { ratingA: 2 } }, { type: 'device/place', id: 'srv', rackId: 'rk', bottomU: 1, template: server });
    const overload = checkPlan(c).find((i) => i.code === 'feed_overload')!;
    expect(overload).toMatchObject({ severity: 'warn', message: 'Feed A of RK-01 needs 3.4 A at 230 V, but MCB-01 way 1 is rated 2 A.' });
  });
});
