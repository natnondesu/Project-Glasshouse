import { applyPlanCommand, createObject, emptyContent, type PlanCommand, type PlanContent, type Rack, type Template } from '@glasshouse/domain';
import { expect, it } from 'vitest';
import { memberPort } from './memberPort';

const sw: Template = {
  id: 't-sw', version: 1, label: 'Switch', model: '', category: 'network', mounting: 'rack', heightU: 1, depthMm: 400, demand: { kind: 'known', watts: 10 },
  color: '', defaultConfig: '', slotCount: null, slotsPerRow: null, illustrative: false, ports: [{ count: 8, prefix: 'GE1/0/', start: 1, media: 'rj45', speed: '1G' }],
};
const build = (cmds: PlanCommand[]): PlanContent =>
  cmds.reduce((c, cmd) => {
    const r = applyPlanCommand(c, cmd);
    if (!r.ok) throw new Error(r.error.message);
    return r.value;
  }, emptyContent());
const content = build([
  { type: 'object/add', object: { ...(createObject('rack', { x: 1, y: 1 }, []) as Rack), id: 'rk', name: 'RK-01' } },
  { type: 'device/place', id: 'm1', rackId: 'rk', bottomU: 40, template: sw },
  { type: 'device/place', id: 'm2', rackId: 'rk', bottomU: 39, template: sw },
  { type: 'device/place', id: 'solo', rackId: 'rk', bottomU: 30, template: sw },
  { type: 'stack/create', stack: { id: 'st', name: 'CORE', members: [{ deviceId: 'm1', member: 1 }, { deviceId: 'm2', member: 2 }] } },
]);

it('starts a stack member port with its member number, since members share port names', () => {
  expect(memberPort(content, { deviceId: 'm2', port: 'GE1/0/3' })).toBe('S2 GE1/0/3');
  expect(memberPort(content, { deviceId: 'm1', port: 'GE1/0/3' })).toBe('S1 GE1/0/3');
});

it('leaves a port on a switch outside any stack as it is', () => {
  expect(memberPort(content, { deviceId: 'solo', port: 'GE1/0/3' })).toBe('GE1/0/3');
});
