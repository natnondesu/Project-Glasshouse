import { describe, expect, it } from 'vitest';
import { vlanIssues } from './checks/vlans';
import { applyPlanCommand, type PlanCommand } from './commands/plan';
import { emptyContent } from './factories';
import { migrate } from './migrations';
import type { PlanContent, PortVlan, Rack, Template } from './model/types';
import { createObject } from './objects';
import { cableCsv, cableSchedule, portsOf } from './ports';
import { vlanLabel } from './vlans';

const T: Template = {
  id: 'tpl', version: 1, label: 'Switch', model: '', category: 'network', mounting: 'rack', heightU: 1, depthMm: 400, demand: { kind: 'known', watts: 50 },
  color: '', defaultConfig: '', slotCount: null, slotsPerRow: null, illustrative: false, ports: [{ count: 4, prefix: 'p', start: 1, media: 'rj45', speed: '1G' }],
};
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
const setVlan = (deviceId: string, name: string, vlan: PortVlan | null): PlanCommand => ({ type: 'port/vlan', deviceId, name, vlan });
function room(): PlanContent {
  return run(
    emptyContent(),
    { type: 'object/add', object: { ...(createObject('rack', { x: 1, y: 1 }, []) as Rack), id: 'rk', name: 'RK-01' } },
    { type: 'device/place', id: 'a', rackId: 'rk', bottomU: 10, template: { ...T, label: 'A' } },
    { type: 'device/place', id: 'b', rackId: 'rk', bottomU: 20, template: { ...T, label: 'B' } },
    { type: 'vlan/add', vlan: { vid: 10, name: 'Servers' } },
    { type: 'vlan/add', vlan: { vid: 20, name: 'Storage' } },
    { type: 'vlan/add', vlan: { vid: 99, name: 'Management' } },
    { type: 'link/add', link: { id: 'l', a: { deviceId: 'a', port: 'p1' }, b: { deviceId: 'b', port: 'p1' }, label: 'C-1', cable: 'cat6' } },
  );
}
const vlanOf = (c: PlanContent, id: string, port: string) => portsOf(c, id).find((p) => p.name === port)?.vlan;

describe('room VLANs', () => {
  it('keeps a list of unique VLAN IDs from 1 to 4094 with names', () => {
    const c = room();
    expect(c.vlans).toEqual([{ vid: 10, name: 'Servers' }, { vid: 20, name: 'Storage' }, { vid: 99, name: 'Management' }]);
    expect(fail(c, { type: 'vlan/add', vlan: { vid: 10, name: 'Again' } })).toBe('VLAN 10 already exists.');
    expect(fail(c, { type: 'vlan/add', vlan: { vid: 4095, name: 'X' } })).toBe('VLAN IDs are whole numbers from 1 to 4094.');
  });

  it('carries a VLAN ID change to ports, and takes a removed VLAN off them', () => {
    let c = run(room(), setVlan('a', 'p1', { mode: 'access', vid: 10 }), setVlan('b', 'p1', { mode: 'trunk', allowed: [10, 20], native: 10 }));
    c = run(c, { type: 'vlan/update', vid: 10, patch: { vid: 110 } });
    expect(vlanOf(c, 'a', 'p1')).toEqual({ mode: 'access', vid: 110 });
    expect(vlanOf(c, 'b', 'p1')).toEqual({ mode: 'trunk', allowed: [20, 110], native: 110 });
    c = run(c, { type: 'vlan/remove', vid: 110 });
    expect(vlanOf(c, 'a', 'p1')).toBeUndefined();
    expect(vlanOf(c, 'b', 'p1')).toEqual({ mode: 'trunk', allowed: [20], native: null });
  });
});

describe('port VLAN mode', () => {
  it('sets access or trunk on a port, only with VLANs the room has', () => {
    const c = run(room(), setVlan('a', 'p2', { mode: 'trunk', allowed: 'all', native: 99 }));
    expect(vlanOf(c, 'a', 'p2')).toEqual({ mode: 'trunk', allowed: 'all', native: 99 });
    expect(fail(c, setVlan('a', 'p3', { mode: 'access', vid: 30 }))).toBe('VLAN 30 is not in this room. Add it on the Network tab first.');
    expect(fail(c, setVlan('a', 'p3', { mode: 'trunk', allowed: [10], native: 20 }))).toBe('The native VLAN must be one of the allowed VLANs.');
    expect(vlanOf(run(c, setVlan('a', 'p2', null)), 'a', 'p2')).toBeUndefined();
  });

  it('labels a port for the cable schedule', () => {
    expect(vlanLabel(undefined)).toBe('');
    expect(vlanLabel({ mode: 'access', vid: 10 })).toBe('10');
    expect(vlanLabel({ mode: 'trunk', allowed: [10, 20], native: 99 })).toBe('Trunk 10,20 · native 99');
    expect(vlanLabel({ mode: 'trunk', allowed: 'all', native: null })).toBe('Trunk all');
  });
});

describe('VLAN checks and the cable schedule', () => {
  const codes = (c: PlanContent) => vlanIssues(c).map((i) => i.code);

  it('warns when access ports on one cable are in different VLANs', () => {
    const c = run(room(), setVlan('a', 'p1', { mode: 'access', vid: 10 }), setVlan('b', 'p1', { mode: 'access', vid: 20 }));
    expect(vlanIssues(c).map((i) => i.message)).toEqual(['SW-01 p1 is in VLAN 10 but SW-02 p1 is in VLAN 20.']);
  });

  it('accepts access to a trunk whose native VLAN matches, and warns otherwise', () => {
    const ok = run(room(), setVlan('a', 'p1', { mode: 'access', vid: 10 }), setVlan('b', 'p1', { mode: 'trunk', allowed: [10, 20], native: 10 }));
    expect(codes(ok)).toEqual([]);
    const bad = run(ok, setVlan('b', 'p1', { mode: 'trunk', allowed: [10, 20], native: 20 }));
    expect(codes(bad)).toEqual(['vlan_native_mismatch']);
  });

  it('warns when two trunks carry different VLANs or natives; all means every room VLAN', () => {
    const c = run(room(), setVlan('a', 'p1', { mode: 'trunk', allowed: [10, 20, 99], native: 99 }), setVlan('b', 'p1', { mode: 'trunk', allowed: [10, 99], native: 99 }));
    expect(vlanIssues(c).map((i) => i.message)).toEqual(['Trunks SW-01 p1 and SW-02 p1 carry different VLANs: 20 only on SW-01.']);
    const same = run(c, setVlan('a', 'p1', { mode: 'trunk', allowed: 'all', native: 99 }), setVlan('b', 'p1', { mode: 'trunk', allowed: [10, 20, 99], native: 99 }));
    expect(codes(same)).toEqual([]);
    expect(codes(run(same, setVlan('b', 'p1', { mode: 'trunk', allowed: [10, 20, 99], native: 10 })))).toEqual(['vlan_native_mismatch']);
  });

  it('adds a VLAN column to the cable schedule', () => {
    const c = run(room(), setVlan('a', 'p1', { mode: 'access', vid: 10 }), setVlan('b', 'p1', { mode: 'trunk', allowed: [10], native: 10 }));
    expect(cableSchedule(c)[0]!.vlan).toBe('10 / Trunk 10 · native 10');
    expect(cableCsv(cableSchedule(c)).split('\r\n')[0]).toBe('Label,From rack,From device,From port,To rack,To device,To port,Cable,VLAN');
    const same = run(c, setVlan('b', 'p1', { mode: 'access', vid: 10 }));
    expect(cableSchedule(same)[0]!.vlan).toBe('10');
  });

  it('upgrades schema 6 revisions with an empty VLAN list', () => {
    const m = migrate({ schemaVersion: 6, catalog: [], lastBackupAt: null, projects: [{ sites: [{ rooms: [{ plan: { revisions: [{ content: { links: [] } }] } }] }] }] });
    expect(JSON.stringify(m.ok && m.value)).toContain('"vlans":[]');
  });
});
