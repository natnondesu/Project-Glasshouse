import { describe, expect, it } from 'vitest';
import { seedTemplates } from '../catalog';
import { known, unknownDemand } from '../demand';
import { findRackDevice, findReserved } from '../devices';
import { createWorkspace, emptyContent } from '../factories';
import { currentRevision, findRoom } from '../lookup';
import type { PlanContent, Rack, Template, Workspace } from '../model/types';
import { createObject } from '../objects';
import { applyPlanCommand, type PlanCommand } from './plan';
import { apply, type WorkspaceCommand } from './workspace';

const T: Record<string, Template> = Object.fromEntries(seedTemplates().map((t) => [t.id, t]));
const tpl = (id: string): Template => {
  const t = T[id];
  if (!t) throw new Error(`no template ${id}`);
  return t;
};

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

function twoRacks(): { content: PlanContent; a: Rack; b: Rack } {
  const a = { ...(createObject('rack', { x: 1, y: 0.6 }, []) as Rack), name: 'RK-01' };
  const b = { ...(createObject('rack', { x: 2, y: 0.6 }, []) as Rack), name: 'RK-02' };
  return { content: run(emptyContent(), { type: 'object/add', object: a }, { type: 'object/add', object: b }), a, b };
}
const place = (rackId: string, templateId: string, bottomU: number, id: string): PlanCommand => ({
  type: 'device/place',
  id,
  rackId,
  bottomU,
  template: tpl(templateId),
});

describe('placing devices', () => {
  it('AC05: the same U range works in two racks; overlap inside one rack is refused', () => {
    const { content, a, b } = twoRacks();
    const c = run(content, place(a.id, 'tpl-server-2u', 10, 'd1'), place(b.id, 'tpl-server-2u', 10, 'd2'));
    expect(findRackDevice(c, 'd2')?.rack.id).toBe(b.id);
    expect(fail(c, place(a.id, 'tpl-server-2u', 11, 'd3'))).toBe('SRV-03 would overlap SRV-01 at U11.');
  });

  it('copies the template, names by category and records the template version once', () => {
    const { content, a } = twoRacks();
    const c = run(content, place(a.id, 'tpl-server-2u', 1, 'd1'), place(a.id, 'tpl-server-2u', 3, 'd2'), place(a.id, 'tpl-switch-1u', 42, 'd3'));
    expect(findRackDevice(c, 'd1')?.device).toMatchObject({ name: 'SRV-01', kind: 'device', heightU: 2, depthMm: 780, demand: { watts: 450 }, templateVersion: 1 });
    expect(findRackDevice(c, 'd3')?.device.name).toBe('SW-01');
    expect(c.templatesUsed.map((t) => t.id)).toEqual(['tpl-server-2u', 'tpl-switch-1u']);
  });

  it('refuses overflow, slot templates and missing racks', () => {
    const { content, a } = twoRacks();
    expect(fail(content, place(a.id, 'tpl-server-4u', 40, 'd1'))).toBe('SRV-01 needs U40–U43, but RK-01 has 42U.');
    expect(fail(content, place(a.id, 'tpl-node', 1, 'd1'))).toBe('Node server goes in a Chassis slot, not directly in a rack.');
    expect(fail(content, place('nope', 'tpl-server-1u', 1, 'd1'))).toBe('That rack no longer exists.');
  });
});

describe('moving, editing and removing devices', () => {
  it('moves a device to another rack, keeping its id', () => {
    const { content, a, b } = twoRacks();
    const c = run(content, place(a.id, 'tpl-server-2u', 1, 'd1'), { type: 'device/move', id: 'd1', rackId: b.id, bottomU: 20 });
    expect(findRackDevice(c, 'd1')).toMatchObject({ rack: { id: b.id }, device: { bottomU: 20 } });
    expect(c.objects.find((o) => o.id === a.id)).toMatchObject({ devices: [] });
  });

  it('moves within a rack onto its own old span, but not onto a neighbour', () => {
    const { content, a } = twoRacks();
    const c = run(content, place(a.id, 'tpl-server-2u', 1, 'd1'), place(a.id, 'tpl-server-2u', 5, 'd2'));
    expect(findRackDevice(run(c, { type: 'device/move', id: 'd1', rackId: a.id, bottomU: 2 }), 'd1')?.device.bottomU).toBe(2);
    expect(fail(c, { type: 'device/move', id: 'd1', rackId: a.id, bottomU: 4 })).toBe('SRV-01 would overlap SRV-02 at U5.');
  });

  it('updates demand, depth and text, and validates', () => {
    const { content, a } = twoRacks();
    const c = run(content, place(a.id, 'tpl-server-1u', 1, 'd1'), { type: 'device/update', id: 'd1', patch: { demand: unknownDemand(), depthMm: 1070, config: '2× CPU' } });
    expect(findRackDevice(c, 'd1')?.device).toMatchObject({ demand: { kind: 'unknown' }, depthMm: 1070, config: '2× CPU' });
    expect(fail(c, { type: 'device/update', id: 'd1', patch: { demand: known(-1) } })).toBe('Demand must be between 0 and 20,000 W.');
    expect(fail(c, { type: 'device/update', id: 'd1', patch: { name: '' } })).toBe("Name can't be empty.");
    expect(fail(c, { type: 'device/update', id: 'd1', patch: { slotCount: 4 } })).toBe('SRV-01 is not a Chassis.');
    expect(fail(c, { type: 'device/update', id: 'd1', patch: { depthMm: 3000 } })).toBe('Depth must be a whole number from 100 to 1500 mm.');
  });

  it('removes a device', () => {
    const { content, a } = twoRacks();
    const c = run(content, place(a.id, 'tpl-server-1u', 1, 'd1'), { type: 'device/remove', id: 'd1' });
    expect(findRackDevice(c, 'd1')).toBeNull();
    expect(fail(c, { type: 'device/remove', id: 'd1' })).toBe('That device no longer exists.');
  });
});

describe('reserved ranges', () => {
  it('occupies U like a device and can be edited and removed', () => {
    const { content, a } = twoRacks();
    const range = { id: 'r1', label: 'Customer core', bottomU: 1, heightU: 14, demand: unknownDemand(), notes: '' };
    let c = run(content, { type: 'reserved/add', rackId: a.id, range });
    expect(fail(c, place(a.id, 'tpl-server-2u', 13, 'd1'))).toBe('SRV-01 would overlap Customer core at U13.');
    c = run(c, { type: 'reserved/update', id: 'r1', patch: { heightU: 10, demand: known(900) } });
    expect(findReserved(c, 'r1')?.range).toMatchObject({ heightU: 10, demand: { watts: 900 } });
    expect(fail(c, { type: 'reserved/update', id: 'r1', patch: { label: ' ' } })).toBe("Label can't be empty.");
    c = run(c, { type: 'reserved/remove', id: 'r1' });
    expect(findReserved(c, 'r1')).toBeNull();
  });
});

describe('AC09: template changes never touch placed devices', () => {
  it('keeps the copied values after the template is edited and deleted', () => {
    const rack = { ...(createObject('rack', { x: 1, y: 0.6 }, []) as Rack), name: 'RK-01' };
    const cmds: WorkspaceCommand[] = [
      { type: 'project/create', id: 'p', name: 'P' },
      { type: 'site/create', projectId: 'p', id: 's', name: 'S' },
      { type: 'room/create', siteId: 's', id: 'r', floorAreaId: 'fa-r', name: 'R' },
      { type: 'plan', roomId: 'r', command: { type: 'object/add', object: rack } },
    ];
    let ws: Workspace = cmds.reduce((w, cmd) => {
      const res = apply(w, cmd);
      if (!res.ok) throw new Error(res.error.message);
      return res.value;
    }, createWorkspace());
    const template = ws.catalog.find((t) => t.id === 'tpl-server-2u');
    if (!template) throw new Error('seed missing');
    for (const cmd of [
      { type: 'plan', roomId: 'r', command: { type: 'device/place', id: 'd1', rackId: rack.id, bottomU: 1, template } },
      { type: 'template/update', id: 'tpl-server-2u', patch: { demand: known(999), heightU: 3 } },
      { type: 'template/delete', id: 'tpl-server-2u' },
    ] as WorkspaceCommand[]) {
      const res = apply(ws, cmd);
      if (!res.ok) throw new Error(res.error.message);
      ws = res.value;
    }
    const content = currentRevision(findRoom(ws, 'r')!.room.plan).content;
    expect(findRackDevice(content, 'd1')?.device).toMatchObject({ heightU: 2, demand: { watts: 450 }, templateVersion: 1 });
    expect(content.templatesUsed[0]).toMatchObject({ id: 'tpl-server-2u', version: 1 });
  });
});
