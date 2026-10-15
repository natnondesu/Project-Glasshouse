import { describe, expect, it } from 'vitest';
import { seedTemplates } from '../catalog';
import { findNode, findRackDevice } from '../devices';
import { emptyContent } from '../factories';
import type { Chassis, PlacedDevice, PlanContent, Rack, Template } from '../model/types';
import { createObject } from '../objects';
import { applyPlanCommand, type PlanCommand } from './plan';

const T = Object.fromEntries(seedTemplates().map((t) => [t.id, t])) as Record<string, Template>;
const run = (content: PlanContent, ...cmds: PlanCommand[]): PlanContent =>
  cmds.reduce((c, cmd) => {
    const r = applyPlanCommand(c, cmd);
    if (!r.ok) throw new Error(r.error.message);
    return r.value;
  }, content);

function room(): PlanContent {
  const a = { ...(createObject('rack', { x: 1, y: 0.6 }, []) as Rack), id: 'a', name: 'RK-01' };
  const b = { ...(createObject('rack', { x: 2, y: 0.6 }, []) as Rack), id: 'b', name: 'RK-02' };
  return run(
    { ...emptyContent(), vlans: [{ vid: 10, name: 'Servers' }] },
    { type: 'object/add', object: a },
    { type: 'object/add', object: b },
    { type: 'device/place', id: 'srv', rackId: 'a', bottomU: 1, template: T['tpl-server-2u']! },
    { type: 'device/update', id: 'srv', patch: { config: 'BIOS 2.1', notes: 'Rear PSU swapped' } },
    { type: 'port/add', deviceId: 'srv', port: { name: 'eth0', media: 'rj45', speed: '1G', vlan: { mode: 'access', vid: 10 } } },
    { type: 'port/add', deviceId: 'srv', port: { name: 'eth1', media: 'rj45', speed: '1G' } },
    { type: 'device/place', id: 'ch', rackId: 'a', bottomU: 10, template: T['tpl-chassis-6u']! },
    { type: 'node/insert', id: 'n1', chassisId: 'ch', slot: 2, template: T['tpl-node']! },
  );
}

const paste = (content: PlanContent, sourceId: string, id: string, rackId: string, bottomU: number, nodeIds: string[] = []): ReturnType<typeof applyPlanCommand> => {
  const src = findRackDevice(content, sourceId)!.device;
  const templates = content.templatesUsed;
  return applyPlanCommand(content, { type: 'device/paste', id, rackId, bottomU, source: src, nodeIds, templates });
};

describe('pasting a copied device', () => {
  it('makes a new device with its own name and ID, keeping template, demand, configuration, notes and ports', () => {
    const c = room();
    const r = paste(c, 'srv', 'srv2', 'b', 5);
    if (!r.ok) throw new Error(r.error.message);
    const copy = findRackDevice(r.value, 'srv2')!;
    const original = findRackDevice(c, 'srv')!.device as PlacedDevice;
    expect(copy.rack.id).toBe('b');
    expect(copy.device).toMatchObject({ kind: 'device', bottomU: 5, templateId: original.templateId, config: 'BIOS 2.1', notes: 'Rear PSU swapped', demand: original.demand });
    expect(copy.device.name).not.toBe(original.name);
    expect(copy.device.name).toMatch(/^SRV-\d\d$/);
    expect(copy.device.ports).toEqual(original.ports);
    expect(original.ports).toHaveLength(2);
  });

  it('copies a Chassis with its Nodes, each with a new ID and name', () => {
    const r = paste(room(), 'ch', 'ch2', 'b', 20, ['n1-copy']);
    if (!r.ok) throw new Error(r.error.message);
    const copy = findRackDevice(r.value, 'ch2')!.device as Chassis;
    expect(copy.nodes).toHaveLength(1);
    expect(copy.nodes[0]).toMatchObject({ id: 'n1-copy', slot: 2 });
    expect(findNode(r.value, 'n1')!.chassis.id).toBe('ch');
    expect(copy.nodes[0]!.name).not.toBe(findNode(r.value, 'n1')!.node.name);
  });

  it('refuses an overlap, a missing Node ID, or a reused ID', () => {
    expect(paste(room(), 'srv', 'x', 'a', 1)).toMatchObject({ ok: false });
    expect(paste(room(), 'ch', 'ch2', 'b', 20, [])).toMatchObject({ ok: false, error: { message: 'Each pasted Node needs an ID.' } });
    expect(paste(room(), 'srv', 'ch', 'b', 30)).toMatchObject({ ok: false, error: { message: 'A device with this ID already exists.' } });
  });

  it('pasting into another room keeps the templates it needs and drops VLANs that room does not have', () => {
    const c = room();
    const src = findRackDevice(c, 'srv')!.device;
    const other = run(emptyContent(), { type: 'object/add', object: { ...(createObject('rack', { x: 1, y: 0.6 }, []) as Rack), id: 'z', name: 'RK-09' } });
    const r = applyPlanCommand(other, { type: 'device/paste', id: 'p1', rackId: 'z', bottomU: 1, source: src, nodeIds: [], templates: c.templatesUsed });
    if (!r.ok) throw new Error(r.error.message);
    expect(r.value.templatesUsed.map((t) => t.id)).toContain(src.templateId);
    expect(findRackDevice(r.value, 'p1')!.device.ports!.every((p) => p.vlan === undefined)).toBe(true);
  });
});
