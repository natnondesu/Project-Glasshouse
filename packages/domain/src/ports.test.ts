import { describe, expect, it } from 'vitest';
import { linkIssues } from './checks/links';
import { applyPlanCommand, type PlanCommand } from './commands/plan';
import { emptyContent } from './factories';
import { migrate } from './migrations';
import type { PlanContent, Rack, Template } from './model/types';
import { createObject } from './objects';
import { cableSchedule, effectiveVlan, expandPorts, portsOf, validatePortGroups } from './ports';
import { validateTemplate } from './catalog';

const SWITCH: Template = {
  id: 'tpl-sw', version: 1, label: 'Switch 48', model: 'X', category: 'network', mounting: 'rack', heightU: 1, depthMm: 400,
  demand: { kind: 'known', watts: 100 }, color: '#000', defaultConfig: '', slotCount: null, slotsPerRow: null, illustrative: false,
  ports: [
    { count: 4, prefix: 'Gi1/0/', start: 1, media: 'rj45', speed: '1G' },
    { count: 2, prefix: 'Te1/1/', start: 1, media: 'sfp_plus', speed: '10G' },
  ],
};
const SERVER: Template = { ...SWITCH, id: 'tpl-srv', label: 'Server', category: 'server', heightU: 2, ports: [{ count: 2, prefix: 'eth', start: 0, media: 'rj45', speed: '1G' }] };

function run(c: PlanContent, ...cmds: PlanCommand[]): PlanContent {
  return cmds.reduce((acc, cmd) => {
    const r = applyPlanCommand(acc, cmd);
    if (!r.ok) throw new Error(r.error.message);
    return r.value;
  }, c);
}
const fail = (c: PlanContent, cmd: PlanCommand): string => {
  const r = applyPlanCommand(c, cmd);
  return r.ok ? 'ok' : r.error.message;
};
function room(): PlanContent {
  return run(
    emptyContent(),
    { type: 'object/add', object: { ...(createObject('rack', { x: 1, y: 1 }, []) as Rack), id: 'rk', name: 'RK-01' } },
    { type: 'device/place', id: 'sw', rackId: 'rk', bottomU: 40, template: SWITCH },
    { type: 'device/place', id: 'srv', rackId: 'rk', bottomU: 1, template: SERVER },
  );
}
const link = (id: string, a: [string, string], b: [string, string], label = ''): PlanCommand => ({
  type: 'link/add',
  link: { id, a: { deviceId: a[0], port: a[1] }, b: { deviceId: b[0], port: b[1] }, label, cable: null },
});

describe('port templates', () => {
  it('expands groups into named ports', () => {
    expect(expandPorts(SWITCH.ports!).map((p) => p.name)).toEqual(['Gi1/0/1', 'Gi1/0/2', 'Gi1/0/3', 'Gi1/0/4', 'Te1/1/1', 'Te1/1/2']);
    expect(expandPorts(SERVER.ports!)).toEqual([{ name: 'eth0', media: 'rj45', speed: '1G' }, { name: 'eth1', media: 'rj45', speed: '1G' }]);
  });

  it('validates groups: sizes, total and unique names', () => {
    expect(validatePortGroups([{ count: 0, prefix: '', start: 1, media: 'rj45', speed: '1G' }])).toBe('Each port group has 1 to 128 ports.');
    expect(validatePortGroups([{ count: 100, prefix: '', start: 1, media: 'rj45', speed: '1G' }, { count: 100, prefix: 'x', start: 1, media: 'rj45', speed: '1G' }])).toBe('A device has at most 128 ports.');
    expect(validatePortGroups([{ count: 2, prefix: 'p', start: 1, media: 'rj45', speed: '1G' }, { count: 2, prefix: 'p', start: 2, media: 'sfp', speed: '1G' }])).toBe('Port p2 appears twice.');
    expect(validateTemplate({ ...SWITCH, ports: [{ count: 0, prefix: '', start: 1, media: 'rj45', speed: '1G' }] })).toMatchObject({ ok: false });
  });

  it('copies template ports onto placed devices and nodes', () => {
    const c = room();
    expect(portsOf(c, 'sw').map((p) => p.name)).toHaveLength(6);
    expect(portsOf(c, 'srv').map((p) => p.name)).toEqual(['eth0', 'eth1']);
  });
});

describe('device port overrides', () => {
  it('adds, renames and removes ports; renames carry links, removals drop them', () => {
    let c = run(room(), { type: 'port/add', deviceId: 'srv', port: { name: 'ipmi', media: 'rj45', speed: '1G' } }, link('l1', ['srv', 'eth0'], ['sw', 'Gi1/0/1']));
    expect(fail(c, { type: 'port/add', deviceId: 'srv', port: { name: 'eth0', media: 'rj45', speed: '1G' } })).toBe('SRV-01 already has a port eth0.');
    c = run(c, { type: 'port/update', deviceId: 'srv', name: 'eth0', patch: { name: 'nic0' } });
    expect(c.links[0]!.a).toEqual({ deviceId: 'srv', port: 'nic0' });
    c = run(c, { type: 'port/remove', deviceId: 'srv', name: 'nic0' });
    expect(c.links).toEqual([]);
    expect(portsOf(c, 'srv').map((p) => p.name)).toEqual(['eth1', 'ipmi']);
  });

  it('resets a device to its template ports', () => {
    let c = run(room(), { type: 'port/remove', deviceId: 'srv', name: 'eth1' });
    c = run(c, { type: 'port/reset', deviceId: 'srv' });
    expect(portsOf(c, 'srv').map((p) => p.name)).toEqual(['eth0', 'eth1']);
  });
});

describe('links', () => {
  it('joins two free ports, one link per port, never a port to itself', () => {
    const c = run(room(), link('l1', ['srv', 'eth0'], ['sw', 'Gi1/0/1'], 'C-001'));
    expect(c.links).toHaveLength(1);
    expect(fail(c, link('l2', ['srv', 'eth1'], ['sw', 'Gi1/0/1']))).toBe('SW-01 Gi1/0/1 is already linked to SRV-01 eth0.');
    expect(fail(c, link('l3', ['sw', 'Gi1/0/2'], ['sw', 'Gi1/0/2']))).toBe("A port can't link to itself.");
    expect(fail(c, link('l4', ['sw', 'nope'], ['srv', 'eth1']))).toBe('SW-01 has no port nope.');
  });

  it('updates and removes links, and drops them when a device goes', () => {
    let c = run(room(), link('l1', ['srv', 'eth0'], ['sw', 'Gi1/0/1']), { type: 'link/update', id: 'l1', patch: { label: 'C-9', cable: 'cat6a' } });
    expect(c.links[0]).toMatchObject({ label: 'C-9', cable: 'cat6a' });
    c = run(c, { type: 'device/remove', id: 'srv' });
    expect(c.links).toEqual([]);
    c = run(c, link('l2', ['sw', 'Gi1/0/1'], ['sw', 'Gi1/0/2']), { type: 'link/remove', id: 'l2' });
    expect(c.links).toEqual([]);
  });

  it('warns about media mismatches', () => {
    const c = run(room(), link('l1', ['srv', 'eth0'], ['sw', 'Te1/1/1']));
    expect(linkIssues(c).map((i) => i.message)).toEqual(['SRV-01 eth0 (RJ45) is linked to SW-01 Te1/1/1 (SFP+).']);
  });

  it('gives a port with no VLAN of its own the VLAN of the port it is cabled to, saying where from', () => {
    let c = run(room(), { type: 'vlan/add', vlan: { vid: 451, name: 'Servers' } }, { type: 'vlan/add', vlan: { vid: 10, name: 'Mgmt' } }, link('l1', ['srv', 'eth0'], ['sw', 'Gi1/0/1']));
    expect(effectiveVlan(c, { deviceId: 'srv', port: 'eth0' })).toBeNull();
    c = run(c, { type: 'port/vlan', deviceId: 'sw', name: 'Gi1/0/1', vlan: { mode: 'access', vid: 451 } });
    expect(effectiveVlan(c, { deviceId: 'srv', port: 'eth0' })).toEqual({ vlan: { mode: 'access', vid: 451 }, from: { device: 'SW-01', port: 'Gi1/0/1' } });
    // Its own setting wins, and nothing is copied: the far end keeps its own.
    c = run(c, { type: 'port/vlan', deviceId: 'srv', name: 'eth0', vlan: { mode: 'access', vid: 10 } });
    expect(effectiveVlan(c, { deviceId: 'srv', port: 'eth0' })).toEqual({ vlan: { mode: 'access', vid: 10 }, from: null });
    expect(effectiveVlan(c, { deviceId: 'srv', port: 'eth1' })).toBeNull();
  });

  it('lists a cable schedule with rack, device and port on each end', () => {
    const c = run(room(), link('l1', ['srv', 'eth0'], ['sw', 'Gi1/0/1'], 'C-001'), { type: 'link/update', id: 'l1', patch: { cable: 'cat6' } });
    expect(cableSchedule(c)).toEqual([{ id: 'l1', from: { rack: 'RK-01', device: 'SRV-01', port: 'eth0' }, to: { rack: 'RK-01', device: 'SW-01', port: 'Gi1/0/1' }, label: 'C-001', cable: 'Cat 6', vlan: '' }]);
  });

  it('upgrades schema 5 revisions with an empty link list', () => {
    const m = migrate({ schemaVersion: 5, catalog: [], lastBackupAt: null, projects: [{ sites: [{ rooms: [{ plan: { revisions: [{ content: { feeds: [] } }] } }] }] }] });
    expect(JSON.stringify(m.ok && m.value)).toContain('"links":[]');
  });
});

describe('port summaries', () => {
  it('summarises a port mix and writes a cable CSV', async () => {
    const { portMix, cableCsv } = await import('./ports');
    const c = run(room(), link('l1', ['srv', 'eth0'], ['sw', 'Gi1/0/1'], 'C, 001'));
    expect(portMix(portsOf(c, 'sw'))).toBe('4× RJ45 1G, 2× SFP+ 10G');
    expect(cableCsv(cableSchedule(c)).split('\r\n')).toEqual(['Label,From rack,From device,From port,To rack,To device,To port,Cable,VLAN', '"C, 001",RK-01,SRV-01,eth0,RK-01,SW-01,Gi1/0/1,,']);
  });
});
