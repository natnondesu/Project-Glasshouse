import { applyPlanCommand, createObject, emptyContent, type PlanCommand, type PlanContent, type Rack, type Template } from '@glasshouse/domain';
import { describe, expect, it } from 'vitest';
import { buildTopology, NODE_H } from './topology';

const tpl = (category: Template['category'], ports: number): Template => ({
  id: `t-${category}-${ports}`, version: 1, label: category, model: '', category, mounting: 'rack', heightU: 1, depthMm: 400, demand: { kind: 'known', watts: 10 },
  color: '', defaultConfig: '', slotCount: null, slotsPerRow: null, illustrative: false, ports: [{ count: ports, prefix: 'p', start: 1, media: 'rj45', speed: '1G' }],
});
function build(cmds: PlanCommand[]): PlanContent {
  return cmds.reduce((c, cmd) => {
    const r = applyPlanCommand(c, cmd);
    if (!r.ok) throw new Error(r.error.message);
    return r.value;
  }, emptyContent());
}
const rack: PlanCommand = { type: 'object/add', object: { ...(createObject('rack', { x: 1, y: 1 }, []) as Rack), id: 'rk', name: 'RK-01' } };
const dev = (id: string, u: number, t: Template): PlanCommand => ({ type: 'device/place', id, rackId: 'rk', bottomU: u, template: t });
let n = 0;
const link = (a: string, ap: string, b: string, bp: string, cable: 'cat6' | 'om4' = 'cat6'): PlanCommand => ({
  type: 'link/add',
  link: { id: `l${(n += 1)}`, a: { deviceId: a, port: ap }, b: { deviceId: b, port: bp }, label: '', cable },
});

describe('buildTopology', () => {
  it('hangs single-cable devices under their switch, centred, one row down', () => {
    const t = buildTopology(build([rack, dev('sw', 40, tpl('network', 8)), dev('s1', 1, tpl('server', 2)), dev('s2', 3, tpl('server', 2)), link('s1', 'p1', 'sw', 'p1'), link('s2', 'p1', 'sw', 'p2')]));
    const at = (id: string) => t.nodes.find((x) => x.id === id)!;
    expect([at('s1').leaf, at('s2').leaf, at('sw').leaf]).toEqual([true, true, false]);
    expect(at('s1').y).toBe(at('s2').y);
    expect(at('s1').y).toBeGreaterThan(at('sw').y + NODE_H);
    expect(at('sw').x).toBe((at('s1').x + at('s2').x) / 2);
  });

  it('puts peer switches side by side and an aggregation switch above the switches it joins', () => {
    const peers = buildTopology(build([rack, dev('a', 40, tpl('network', 8)), dev('b', 38, tpl('network', 8)), dev('s', 1, tpl('server', 2)), link('a', 'p1', 'b', 'p1', 'om4'), link('s', 'p1', 'a', 'p2')]));
    const pa = peers.nodes.find((x) => x.id === 'a')!;
    const pb = peers.nodes.find((x) => x.id === 'b')!;
    expect(pa.y).toBe(pb.y);
    const uplink = peers.edges.find((e) => [e.a, e.b].sort().join() === 'a,b')!;
    expect(uplink).toMatchObject({ fibre: true, tree: false });

    const agg = buildTopology(build([rack, dev('core', 42, tpl('network', 8)), dev('a', 40, tpl('network', 8)), dev('b', 38, tpl('network', 8)), link('a', 'p1', 'core', 'p1'), link('b', 'p1', 'core', 'p2')]));
    const core = agg.nodes.find((x) => x.id === 'core')!;
    expect(agg.nodes.filter((x) => x.id !== 'core').every((x) => x.y > core.y)).toBe(true);
  });

  it('draws several cables between two devices as one line, and lists devices with no cables', () => {
    const t = buildTopology(build([rack, dev('a', 40, tpl('network', 8)), dev('b', 38, tpl('network', 8)), dev('lonely', 1, tpl('server', 2)), link('a', 'p1', 'b', 'p1'), link('a', 'p2', 'b', 'p2')]));
    expect(t.edges).toHaveLength(1);
    expect(t.edges[0]!.links).toHaveLength(2);
    expect(t.unlinked.map((u) => u.name)).toEqual(['SRV-01']);
  });

  it('wraps many leaves under one switch into rows, and narrows further to fit a printed page', async () => {
    const { fitTopology } = await import('./topology');
    const servers = Array.from({ length: 8 }, (_, i) => `s${i}`);
    const content = build([rack, dev('sw', 40, tpl('network', 24)), ...servers.map((id, i) => dev(id, 1 + i * 2, tpl('server', 2))), ...servers.map((id, i) => link(id, 'p1', 'sw', `p${i + 1}`))]);
    const t = buildTopology(content);
    const rows = new Set(t.nodes.filter((x) => x.leaf).map((x) => x.leafRow));
    expect([...rows].sort()).toEqual([0, 1]);
    expect(t.nodes.filter((x) => x.leafRow === 1)).toHaveLength(2);
    expect(fitTopology(content, 700).width).toBeLessThanOrEqual(700);
  });
});

