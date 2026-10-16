import { describe, expect, it } from 'vitest';
import { emptyContent } from '../factories';
import type { PlanContent, Rack, Template } from '../model/types';
import { createObject } from '../objects';
import { portsOf } from '../ports';
import { applyPlanCommand, type PlanCommand } from './plan';

const SWITCH: Template = {
  id: 'tpl-sw', version: 1, label: 'Switch', model: 'X', category: 'network', mounting: 'rack', heightU: 1, depthMm: 400,
  demand: { kind: 'known', watts: 100 }, color: '', defaultConfig: '', slotCount: null, slotsPerRow: null, illustrative: false,
  ports: [{ count: 4, prefix: 'Gi', start: 1, media: 'rj45', speed: '1G' }],
};
function run(c: PlanContent, ...cmds: PlanCommand[]): PlanContent {
  return cmds.reduce((acc, cmd) => {
    const r = applyPlanCommand(acc, cmd);
    if (!r.ok) throw new Error(r.error.message);
    return r.value;
  }, c);
}
const room = (): PlanContent =>
  run(
    emptyContent(),
    { type: 'object/add', object: { ...(createObject('rack', { x: 1, y: 1 }, []) as Rack), id: 'rk' } },
    { type: 'device/place', id: 'sw', rackId: 'rk', bottomU: 40, template: SWITCH },
    { type: 'vlan/add', vlan: { vid: 10, name: 'Servers' } },
    { type: 'vlan/add', vlan: { vid: 20, name: 'Cameras' } },
    { type: 'port/update', deviceId: 'sw', name: 'Gi1', patch: { speed: '10G' } },
    { type: 'port/vlan', deviceId: 'sw', name: 'Gi2', vlan: { mode: 'access', vid: 20 } },
  );
const ports = (c: PlanContent) => Object.fromEntries(portsOf(c, 'sw').map((p) => [p.name, p]));

describe('port/bulk', () => {
  it('changes only the fields given, leaving each port’s other values as they were', () => {
    const c = run(room(), { type: 'port/bulk', deviceId: 'sw', names: ['Gi1', 'Gi2', 'Gi3'], patch: { media: 'sfp_plus' } });
    const p = ports(c);
    expect([p.Gi1!.media, p.Gi2!.media, p.Gi3!.media, p.Gi4!.media]).toEqual(['sfp_plus', 'sfp_plus', 'sfp_plus', 'rj45']);
    // Speed and VLAN untouched, per port.
    expect([p.Gi1!.speed, p.Gi2!.speed]).toEqual(['10G', '1G']);
    expect(p.Gi2!.vlan).toEqual({ mode: 'access', vid: 20 });
    expect(p.Gi1!.vlan).toBeUndefined();
  });

  it('bundles ports into a LAG with one VLAN, and can clear both again', () => {
    let c = run(room(), { type: 'port/bulk', deviceId: 'sw', names: ['Gi1', 'Gi2'], patch: { lag: 'Po1', vlan: { mode: 'access', vid: 10 } } });
    expect([ports(c).Gi1!.lag, ports(c).Gi2!.lag]).toEqual(['Po1', 'Po1']);
    expect([ports(c).Gi1!.vlan, ports(c).Gi2!.vlan]).toEqual([{ mode: 'access', vid: 10 }, { mode: 'access', vid: 10 }]);
    c = run(c, { type: 'port/bulk', deviceId: 'sw', names: ['Gi1', 'Gi2'], patch: { lag: '', vlan: null } });
    expect([ports(c).Gi1!.lag, ports(c).Gi1!.vlan, ports(c).Gi2!.lag]).toEqual([undefined, undefined, undefined]);
  });

  it('is all or nothing: one bad value leaves every port as it was', () => {
    const before = room();
    const r = applyPlanCommand(before, { type: 'port/bulk', deviceId: 'sw', names: ['Gi1', 'Gi3'], patch: { vlan: { mode: 'access', vid: 999 } } });
    expect(r.ok).toBe(false);
    expect(applyPlanCommand(before, { type: 'port/bulk', deviceId: 'sw', names: ['Gi1', 'Gi9'], patch: { speed: '25G' } })).toMatchObject({ ok: false, error: { message: 'Port Gi9 no longer exists.' } });
  });
});
