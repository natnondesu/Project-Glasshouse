import { describe, expect, it } from 'vitest';
import { lagIssues } from './checks/lags';
import { applyPlanCommand, type PlanCommand } from './commands/plan';
import { findRackDevice } from './devices';
import { emptyContent } from './factories';
import type { PlanContent, Rack, Template } from './model/types';
import { createObject } from './objects';
import { cableSchedule } from './ports';

const SWITCH: Template = {
  id: 'tpl-sw', version: 1, label: 'Switch', model: 'X', category: 'network', mounting: 'rack', heightU: 1, depthMm: 400,
  demand: { kind: 'known', watts: 100 }, color: '#000', defaultConfig: '', slotCount: null, slotsPerRow: null, illustrative: false,
  ports: [
    { count: 4, prefix: 'Gi1/0/', start: 1, media: 'rj45', speed: '1G' },
    { count: 2, prefix: 'Te1/1/', start: 1, media: 'sfp_plus', speed: '10G' },
  ],
};
const SERVER: Template = { ...SWITCH, id: 'tpl-srv', label: 'Server', category: 'server', heightU: 2, ports: [{ count: 2, prefix: 'eth', start: 0, media: 'rj45', speed: '1G' }] };

const run = (c: PlanContent, ...cmds: PlanCommand[]): PlanContent =>
  cmds.reduce((acc, cmd) => {
    const r = applyPlanCommand(acc, cmd);
    if (!r.ok) throw new Error(r.error.message);
    return r.value;
  }, c);
const lag = (deviceId: string, name: string, group: string): PlanCommand => ({ type: 'port/update', deviceId, name, patch: { lag: group } });
const link = (id: string, a: [string, string], b: [string, string]): PlanCommand => ({ type: 'link/add', link: { id, a: { deviceId: a[0], port: a[1] }, b: { deviceId: b[0], port: b[1] }, label: '', cable: null } });
const port = (c: PlanContent, deviceId: string, name: string) => findRackDevice(c, deviceId)!.device.ports!.find((p) => p.name === name)!;

function room(): PlanContent {
  return run(
    { ...emptyContent(), vlans: [{ vid: 10, name: 'Servers' }, { vid: 20, name: 'Storage' }] },
    { type: 'object/add', object: { ...(createObject('rack', { x: 1, y: 1 }, []) as Rack), id: 'rk', name: 'RK-01' } },
    { type: 'device/place', id: 'sw', rackId: 'rk', bottomU: 40, template: SWITCH },
    { type: 'device/place', id: 'srv', rackId: 'rk', bottomU: 1, template: SERVER },
  );
}

describe('LAGs (port-channels, bonds)', () => {
  it('groups ports by name; a VLAN set on one member applies to every member, and a new member adopts it', () => {
    let c = run(room(), lag('sw', 'Gi1/0/1', 'Po1'), lag('sw', 'Gi1/0/2', 'Po1'));
    c = run(c, { type: 'port/update', deviceId: 'sw', name: 'Gi1/0/1', patch: { vlan: { mode: 'trunk', allowed: [10, 20], native: null } } });
    expect(port(c, 'sw', 'Gi1/0/2').vlan).toEqual({ mode: 'trunk', allowed: [10, 20], native: null });
    c = run(c, lag('sw', 'Gi1/0/3', 'Po1'));
    expect(port(c, 'sw', 'Gi1/0/3')).toMatchObject({ lag: 'Po1', vlan: { mode: 'trunk', allowed: [10, 20], native: null } });
    // Ports outside the group keep their own setting.
    expect(port(c, 'sw', 'Gi1/0/4').vlan).toBeUndefined();
    // Leaving the group: an empty name.
    c = run(c, lag('sw', 'Gi1/0/3', ' '));
    expect(port(c, 'sw', 'Gi1/0/3').lag).toBeUndefined();
  });

  it('refuses a LAG name over 16 characters', () => {
    expect(applyPlanCommand(room(), lag('sw', 'Gi1/0/1', 'Port-channel-1234567'))).toMatchObject({ ok: false, error: { message: 'A LAG name is up to 16 characters.' } });
  });

  it('warns when members differ in speed, or the far ends are not one group', () => {
    const c = run(
      room(),
      lag('sw', 'Gi1/0/1', 'Po1'),
      lag('sw', 'Te1/1/1', 'Po1'),
      link('l1', ['sw', 'Gi1/0/1'], ['srv', 'eth0']),
      link('l2', ['sw', 'Te1/1/1'], ['srv', 'eth1']),
    );
    expect(lagIssues(c).map((i) => i.code).sort()).toEqual(['lag_far_end', 'lag_speed_mismatch']);
    const grouped = run(c, { type: 'port/update', deviceId: 'sw', name: 'Te1/1/1', patch: { lag: '' } }, lag('sw', 'Gi1/0/2', 'Po1'), { type: 'link/remove', id: 'l2' }, link('l3', ['sw', 'Gi1/0/2'], ['srv', 'eth1']), lag('srv', 'eth0', 'bond0'), lag('srv', 'eth1', 'bond0'));
    expect(lagIssues(grouped)).toEqual([]);
  });

  it('shows the LAG beside the port in the cable schedule', () => {
    const c = run(room(), lag('sw', 'Gi1/0/1', 'Po1'), link('l1', ['sw', 'Gi1/0/1'], ['srv', 'eth0']));
    expect(cableSchedule(c)[0]).toMatchObject({ from: { port: 'Gi1/0/1 (Po1)' }, to: { port: 'eth0' } });
  });
});
