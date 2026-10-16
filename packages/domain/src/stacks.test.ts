import { describe, expect, it } from 'vitest';
import { applyPlanCommand, type PlanCommand } from './commands/plan';
import { emptyContent } from './factories';
import type { PlanContent, Rack, Template } from './model/types';
import { createObject } from './objects';
import { stackOf, stacksOf } from './stacks';

const tpl = (category: Template['category']): Template => ({
  id: `t-${category}`, version: 1, label: category, model: '', category, mounting: 'rack', heightU: 1, depthMm: 400, demand: { kind: 'known', watts: 100 },
  color: '', defaultConfig: '', slotCount: null, slotsPerRow: null, illustrative: false, ports: [{ count: 4, prefix: 'Gi1/0/', start: 1, media: 'rj45', speed: '1G' }],
});
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
const room = (): PlanContent =>
  run(
    emptyContent(),
    { type: 'object/add', object: { ...(createObject('rack', { x: 1, y: 1 }, []) as Rack), id: 'r1', name: 'RK-01' } },
    { type: 'object/add', object: { ...(createObject('rack', { x: 2.5, y: 1 }, []) as Rack), id: 'r2', name: 'RK-02' } },
    { type: 'device/place', id: 'sw1', rackId: 'r1', bottomU: 40, template: tpl('network') },
    { type: 'device/place', id: 'sw2', rackId: 'r2', bottomU: 40, template: tpl('network') },
    { type: 'device/place', id: 'srv', rackId: 'r1', bottomU: 1, template: tpl('server') },
  );

describe('stacks', () => {
  it('stacks switches in different racks under one name, each with its member number', () => {
    const c = run(room(), { type: 'stack/create', stack: { id: 'st', name: 'CORE', members: [{ deviceId: 'sw1', member: 1 }] } }, { type: 'stack/member', id: 'st', deviceId: 'sw2', member: 2 });
    expect(stacksOf(c)).toEqual([{ id: 'st', name: 'CORE', members: [{ deviceId: 'sw1', member: 1 }, { deviceId: 'sw2', member: 2 }] }]);
    expect(stackOf(c, 'sw2')).toMatchObject({ member: 2, stack: { name: 'CORE' } });
  });

  it('keeps the rules: network gear only, one stack per switch, unique member numbers 1–9', () => {
    const c = run(room(), { type: 'stack/create', stack: { id: 'st', name: 'CORE', members: [{ deviceId: 'sw1', member: 1 }] } });
    expect(fail(c, { type: 'stack/member', id: 'st', deviceId: 'srv', member: 2 })).toBe('Only network devices in a rack can join a stack.');
    expect(fail(c, { type: 'stack/member', id: 'st', deviceId: 'sw2', member: 1 })).toBe('Member 1 of CORE is already SW-01.');
    expect(fail(c, { type: 'stack/member', id: 'st', deviceId: 'sw2', member: 10 })).toBe('Member numbers are 1 to 9.');
    expect(fail(c, { type: 'stack/create', stack: { id: 'b', name: 'core', members: [{ deviceId: 'sw2', member: 1 }] } })).toBe('A stack named core already exists.');
    expect(fail(c, { type: 'stack/create', stack: { id: 'b', name: 'EDGE', members: [] } })).toBe('A stack starts with at least one switch.');
    const two = run(c, { type: 'stack/create', stack: { id: 'b', name: 'EDGE', members: [{ deviceId: 'sw2', member: 1 }] } });
    expect(fail(two, { type: 'stack/member', id: 'b', deviceId: 'sw1', member: 2 })).toBe('SW-01 is already in stack CORE.');
  });

  it('drops a removed switch from its stack, and the stack with its last member', () => {
    let c = run(room(), { type: 'stack/create', stack: { id: 'st', name: 'CORE', members: [{ deviceId: 'sw1', member: 1 }, { deviceId: 'sw2', member: 2 }] } });
    c = run(c, { type: 'device/remove', id: 'sw2' });
    expect(stacksOf(c)[0]!.members.map((m) => m.deviceId)).toEqual(['sw1']);
    c = run(c, { type: 'device/remove', id: 'sw1' });
    expect(c.stacks).toBeUndefined();
  });
});
