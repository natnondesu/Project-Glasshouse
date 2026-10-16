import { applyPlanCommand, createObject, createWorkspace, currentRevision, emptyContent, withSample, type PlanCommand, type PlanContent, type Rack, type Template } from '@glasshouse/domain';
import { describe, expect, it } from 'vitest';
import { buildTopology, NODE_H, NODE_W, shapedTopology, wrapLabel, type TopoNode } from './topology';

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
    expect(fitTopology(content, 700)!.width).toBeLessThanOrEqual(700);
  });
});


it('sets a core pair side by side over the switches they share (MLAG), not one after the other', () => {
  const ws = withSample(createWorkspace(), '2026-10-16T00:00:00.000Z');
  if (!ws.ok) throw new Error(ws.error.message);
  const content = currentRevision(ws.value.projects[0]!.sites[0]!.rooms[0]!.plan).content;
  const topo = buildTopology(content);
  const at = (name: string) => topo.nodes.find((n) => n.name === name)!;
  const [c1, c2, acc1, acc2] = ['CORE-01', 'CORE-02', 'ACC-01', 'ACC-02'].map(at) as [TopoNode, TopoNode, TopoNode, TopoNode];
  expect(c1.y).toBe(c2.y);
  // Next to each other: nothing fits between them.
  expect(Math.abs(c2.x - c1.x)).toBeLessThan(NODE_W * 2);
  // The pair sits over the switches below, not past their right end.
  expect(Math.max(c1.x, c2.x)).toBeLessThan(Math.max(acc1.x, acc2.x) + NODE_W);
});

describe('box size', () => {
  it('grows every box to the longest name instead of letting it run past the edge', () => {
    const named = (id: string, name: string, u: number, t: Template): PlanCommand => ({ type: 'device/place', id, rackId: 'rk', bottomU: u, template: { ...t, label: name } });
    const content = build([rack, dev('sw', 40, tpl('network', 8)), named('s1', 'Deepvision-Wstorage-02', 1, tpl('server', 2)), link('s1', 'p1', 'sw', 'p1')]);
    const renamed = applyPlanCommand(content, { type: 'device/update', id: 's1', patch: { name: 'Deepvision-Wstorage-02' } });
    const t = buildTopology(renamed.ok ? renamed.value : content);
    const [a, b] = t.nodes;
    expect(a!.w).toBe(b!.w);
    expect(a!.w).toBeGreaterThan(NODE_W);
    expect(t.nodes.every((x) => x.nameLines.join('') === x.name)).toBe(true);
  });

  it('wraps a name past the cap at a hyphen or space, never dropping characters', () => {
    expect(wrapLabel('Neopolis-Compute-05', 30)).toEqual(['Neopolis-Compute-05']);
    expect(wrapLabel('Deepvision-Taskmanager-Controller-01', 26)).toEqual(['Deepvision-Taskmanager-', 'Controller-01']);
    expect(wrapLabel('Video Wall Controller Main Lobby', 26)).toEqual(['Video Wall Controller Main', 'Lobby']);
    expect(wrapLabel('A'.repeat(30), 26).join('')).toBe('A'.repeat(30));
  });
});

it('wraps leaves tighter when the view is tall rather than drawing one long strip', () => {
  const servers = Array.from({ length: 24 }, (_, i) => `s${i}`);
  const content = build([rack, dev('sw', 42, tpl('network', 48)), ...servers.map((id, i) => dev(id, 1 + i, tpl('server', 2))), ...servers.map((id, i) => link(id, 'p1', 'sw', `p${i + 1}`))]);
  const wide = shapedTopology(content, 4000, 300);
  const tall = shapedTopology(content, 800, 900);
  expect(tall.width).toBeLessThan(wide.width);
  expect(tall.height).toBeGreaterThan(wide.height);
});

it('counts a server cable as carrying its switch port’s VLAN when the server end is not set, so highlighting keeps it', async () => {
  const { nodeCarries } = await import('./topology');
  const content = build([rack, { type: 'vlan/add', vlan: { vid: 451, name: 'Servers' } }, dev('sw', 40, tpl('network', 8)), dev('s1', 1, tpl('server', 2)), link('s1', 'p1', 'sw', 'p1'), { type: 'port/vlan', deviceId: 'sw', name: 'p1', vlan: { mode: 'access', vid: 451 } }]);
  const t = buildTopology(content);
  expect(t.edges[0]!.vids).toEqual([451]);
  expect(nodeCarries(content, 's1', 451)).toBe(true);
});

it('for paper, folds single-cable devices into a count on their switch and keeps the gear and its cables', () => {
  const servers = Array.from({ length: 12 }, (_, i) => `s${i}`);
  const content = build([rack, dev('core', 42, tpl('network', 24)), dev('acc', 40, tpl('network', 24)), link('acc', 'p24', 'core', 'p1'), ...servers.map((id, i) => dev(id, 1 + i * 2, tpl('server', 2))), ...servers.map((id, i) => link(id, 'p1', 'acc', `p${i + 1}`))]);
  const t = buildTopology(content, { collapseLeaves: true });
  expect(t.collapsed).toBe(true);
  expect(t.nodes.map((n) => [n.name, n.leafCount]).sort()).toEqual([['SW-01', 0], ['SW-02', 12]]);
  expect(t.edges).toHaveLength(1);
  expect(buildTopology(content).nodes).toHaveLength(14);
});
