import { describe, expect, it } from 'vitest';
import { seedTemplates } from '../catalog';
import { unknownDemand } from '../demand';
import { findNode, findRackDevice } from '../devices';
import { emptyContent } from '../factories';
import type { Chassis, PlanContent, Rack, Template } from '../model/types';
import { createObject } from '../objects';
import { applyPlanCommand, type PlanCommand } from './plan';

const T: Record<string, Template> = Object.fromEntries(seedTemplates().map((t) => [t.id, t]));
const tpl = (id: string): Template => T[id] as Template;

function run(content: PlanContent, ...cmds: PlanCommand[]): PlanContent {
  return cmds.reduce((c, cmd) => {
    const r = applyPlanCommand(c, cmd);
    if (!r.ok) throw new Error(r.error.message);
    return r.value;
  }, content);
}
const fail = (content: PlanContent, cmd: PlanCommand): string => {
  const r = applyPlanCommand(content, cmd);
  if (r.ok) throw new Error('expected a rejection');
  return r.error.message;
};
const insert = (slot: number, id = `n${slot}`, templateId = 'tpl-node'): PlanCommand => ({ type: 'node/insert', id, chassisId: 'ch', slot, template: tpl(templateId) });

function withChassis(): { content: PlanContent; a: Rack; b: Rack } {
  const a = { ...(createObject('rack', { x: 1, y: 0.6 }, []) as Rack), name: 'RK-01' };
  const b = { ...(createObject('rack', { x: 2, y: 0.6 }, []) as Rack), name: 'RK-02' };
  const content = run(
    emptyContent(),
    { type: 'object/add', object: a },
    { type: 'object/add', object: b },
    { type: 'device/place', id: 'ch', rackId: a.id, bottomU: 5, template: tpl('tpl-chassis-6u') },
  );
  return { content, a, b };
}
const chassisOf = (c: PlanContent): Chassis => findRackDevice(c, 'ch')?.device as Chassis;

describe('chassis nodes', () => {
  it('AC06: five nodes fill a 6U chassis without using rack units', () => {
    const { content } = withChassis();
    const c = run(content, insert(1), insert(2), insert(3), insert(4), insert(5));
    expect(chassisOf(c).nodes.map((n) => [n.slot, n.name])).toEqual([
      [1, 'NODE-01'],
      [2, 'NODE-02'],
      [3, 'NODE-03'],
      [4, 'NODE-04'],
      [5, 'NODE-05'],
    ]);
    expect(chassisOf(c)).toMatchObject({ bottomU: 5, heightU: 6 });
    expect(c.templatesUsed.map((t) => t.id)).toEqual(['tpl-chassis-6u', 'tpl-node']);
  });

  it('AC07: refuses an occupied slot, a missing slot and a rack-mounted template', () => {
    const { content } = withChassis();
    const c = run(content, insert(1));
    expect(fail(c, insert(1, 'x'))).toBe('Slot 1 of CH-01 already holds NODE-01.');
    expect(fail(c, insert(6, 'x'))).toBe('CH-01 has slots 1–5.');
    expect(fail(c, insert(2, 'x', 'tpl-server-1u'))).toBe('Server 1U mounts in a rack, not in a Chassis slot.');
    expect(chassisOf(c).nodes).toHaveLength(1);
  });

  it('AC08: moving the chassis keeps every node, id and slot', () => {
    const { content, b } = withChassis();
    const c = run(content, insert(1), insert(4), { type: 'device/move', id: 'ch', rackId: b.id, bottomU: 30 });
    expect(findNode(c, 'n4')).toMatchObject({ rack: { id: b.id }, chassis: { id: 'ch', bottomU: 30 }, node: { slot: 4, name: 'NODE-02' } });
  });

  it('refuses a move that does not fit and leaves the assembly intact', () => {
    const { content, b } = withChassis();
    const c = run(content, insert(1), { type: 'device/place', id: 'sw', rackId: b.id, bottomU: 40, template: tpl('tpl-switch-1u') });
    expect(fail(c, { type: 'device/move', id: 'ch', rackId: b.id, bottomU: 37 })).toBe('CH-01 would overlap SW-01 at U40.');
    expect(findNode(c, 'n1')?.chassis.bottomU).toBe(5);
  });

  it('refuses to drop below an occupied slot', () => {
    const { content } = withChassis();
    const c = run(content, insert(5));
    expect(fail(c, { type: 'device/update', id: 'ch', patch: { slotCount: 4 } })).toBe('Slot 5 holds NODE-01. Move or remove it before reducing CH-01 to 4 slots.');
    expect(chassisOf(run(c, { type: 'device/update', id: 'ch', patch: { slotCount: 8, slotsPerRow: 4 } }))).toMatchObject({ slotCount: 8, slotsPerRow: 4 });
  });

  it('updates and removes nodes; removing the chassis removes its nodes', () => {
    const { content } = withChassis();
    let c = run(content, insert(2), { type: 'node/update', id: 'n2', patch: { demand: unknownDemand(), config: '256 GB RAM' } });
    expect(findNode(c, 'n2')?.node).toMatchObject({ demand: { kind: 'unknown' }, config: '256 GB RAM' });
    expect(fail(c, { type: 'node/update', id: 'n2', patch: { name: '' } })).toBe("Name can't be empty.");
    c = run(c, { type: 'node/remove', id: 'n2' });
    expect(chassisOf(c).nodes).toEqual([]);
    c = run(c, insert(3), { type: 'device/remove', id: 'ch' });
    expect(findNode(c, 'n3')).toBeNull();
    expect(fail(c, insert(1, 'z'))).toBe('That Chassis no longer exists.');
  });

  it('refuses to insert into something that is not a chassis', () => {
    const { content, a } = withChassis();
    const c = run(content, { type: 'device/place', id: 'srv', rackId: a.id, bottomU: 20, template: tpl('tpl-server-1u') });
    expect(fail(c, { type: 'node/insert', id: 'x', chassisId: 'srv', slot: 1, template: tpl('tpl-node') })).toBe('SRV-01 is not a Chassis.');
  });
});
