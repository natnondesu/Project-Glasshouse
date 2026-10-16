import { describe, expect, it } from 'vitest';
import { emptyContent } from '../factories';
import { centerOf } from '../geometry/polygon';
import type { PlanContent, Rack, RoomObject } from '../model/types';
import { createObject, effectiveHeight, nextName } from '../objects';
import { applyPlanCommand, type PlanCommand } from './plan';

function run(content: PlanContent, ...cmds: PlanCommand[]): PlanContent {
  return cmds.reduce((c, cmd) => {
    const r = applyPlanCommand(c, cmd);
    if (!r.ok) throw new Error(r.error.message);
    return r.value;
  }, content);
}

const withRack = (x = 1, y = 1): { content: PlanContent; rack: Rack } => {
  const rack = createObject('rack', { x, y }, []) as Rack;
  return { content: run(emptyContent(), { type: 'object/add', object: rack }), rack };
};

describe('object factories', () => {
  it('names objects by type with the next free number', () => {
    const existing = [{ name: 'RK-01' }, { name: 'RK-02' }, { name: 'Desk' }] as RoomObject[];
    expect(nextName(existing, 'rack')).toBe('RK-03');
    expect(nextName([], 'door')).toBe('D-01');
  });

  it('creates racks with defaults', () => {
    const rack = createObject('rack', { x: 1, y: 2 }, []);
    expect(rack).toMatchObject({ type: 'rack', w: 0.8, d: 1.1, capacityU: 42, usableDepthMm: 1000, owner: 'oxygenai', clearance: { front: 1, rear: 0.6 } });
    expect(effectiveHeight(rack)).toBe(2.05);
    expect(effectiveHeight(createObject('door', { x: 0, y: 0 }, []))).toBe(2.1);
  });
});

describe('object commands', () => {
  it('adds an object and rejects one outside the room bounds', () => {
    const { content } = withRack();
    expect(content.objects).toHaveLength(1);
    const outside = createObject('rack', { x: 4.7, y: 0 }, []);
    expect(applyPlanCommand(emptyContent(), { type: 'object/add', object: outside })).toMatchObject({ ok: false, error: { code: 'out_of_bounds' } });
  });

  it('rounds typed values at the boundary (no float drift)', () => {
    const { content, rack } = withRack();
    const c = run(content, { type: 'object/update', id: rack.id, patch: { x: 0.1 + 0.2, y: 1.006 } });
    expect(c.objects[0]).toMatchObject({ x: 0.3, y: 1.01 });
  });

  it('rejects rack-only fields on other objects', () => {
    const door = createObject('door', { x: 1, y: 3.9 }, []);
    const c = run(emptyContent(), { type: 'object/add', object: door });
    expect(applyPlanCommand(c, { type: 'object/update', id: door.id, patch: { capacityU: 42 } }).ok).toBe(false);
  });

  it('AC03: a typed angle keeps the physical centre', () => {
    const { content, rack } = withRack(2, 1);
    const before = centerOf(rack);
    const c = run(content, { type: 'object/update', id: rack.id, patch: { angle: 37 } });
    const after = centerOf(c.objects[0]!);
    expect(after[0]).toBeCloseTo(before[0], 1);
    expect(after[1]).toBeCloseTo(before[1], 1);
  });

  it('rotates in 45° steps around the centre and returns to 0 after eight steps', () => {
    const { content, rack } = withRack(2, 1);
    const step: PlanCommand = { type: 'object/rotate', id: rack.id, by: 45 };
    const once = run(content, step);
    expect(once.objects[0]?.angle).toBe(45);
    const full = run(content, step, step, step, step, step, step, step, step);
    expect(full.objects[0]?.angle).toBe(0);
    expect(full.objects[0]?.x).toBeCloseTo(2, 1);
  });

  it('refuses to rotate an object flush against a wall when there is no room', () => {
    const { content, rack } = withRack(0, 0);
    const r = applyPlanCommand(content, { type: 'object/rotate', id: rack.id, by: 45 });
    expect(r).toMatchObject({ ok: false, error: { message: `There isn't room to turn ${rack.name} here. Move it away from the wall first.` } });
  });

  it('turns an object 90° flush against the wall when it exactly fits', () => {
    const desk = { ...createObject('furniture', { x: 0, y: 0.2 }, []), w: 1, d: 0.6 };
    const c = run(emptyContent(), { type: 'object/add', object: desk }, { type: 'object/update', id: desk.id, patch: { angle: 90 } });
    expect(c.objects[0]).toMatchObject({ angle: 90, x: 0.2, y: 0 });
  });

  it('validates rack fields', () => {
    const { content, rack } = withRack();
    expect(applyPlanCommand(content, { type: 'object/update', id: rack.id, patch: { capacityU: 61 } }).ok).toBe(false);
    expect(applyPlanCommand(content, { type: 'object/update', id: rack.id, patch: { usableDepthMm: 200 } }).ok).toBe(false);
    expect(applyPlanCommand(content, { type: 'object/update', id: rack.id, patch: { clearance: { front: 3.5 } } }).ok).toBe(false);
    expect(applyPlanCommand(content, { type: 'object/update', id: rack.id, patch: { height: 1.5 } })).toMatchObject({
      ok: false,
      error: { message: `${rack.name} needs at least 2.05 m of height for 42U.` },
    });
    const c = run(content, { type: 'object/update', id: rack.id, patch: { clearance: { rear: 0 }, owner: 'customer' } });
    expect(c.objects[0]).toMatchObject({ owner: 'customer', clearance: { front: 1, rear: 0 } });
  });

  it('rejects empty names, tiny sizes and unknown ids', () => {
    const { content, rack } = withRack();
    expect(applyPlanCommand(content, { type: 'object/update', id: rack.id, patch: { name: ' ' } }).ok).toBe(false);
    expect(applyPlanCommand(content, { type: 'object/update', id: rack.id, patch: { w: 0.05 } }).ok).toBe(false);
    expect(applyPlanCommand(content, { type: 'object/remove', id: 'nope' })).toMatchObject({ ok: false, error: { code: 'not_found' } });
    expect(applyPlanCommand(content, { type: 'object/add', object: rack }).ok).toBe(false);
  });

  it('removes an object', () => {
    const { content, rack } = withRack();
    expect(run(content, { type: 'object/remove', id: rack.id }).objects).toEqual([]);
  });

  it('refuses to shrink the room past a placed object, naming it', () => {
    const { content, rack } = withRack(4, 1);
    expect(applyPlanCommand(content, { type: 'survey/update', patch: { width: 4 } })).toMatchObject({
      ok: false,
      error: { code: 'out_of_bounds', message: `Shrinking the room would leave ${rack.name} outside it. Move or resize it first.` },
    });
  });
});

describe('door hinge', () => {
  it('sets which end a door is hinged on, and refuses it for anything else', () => {
    const door = { ...createObject('door', { x: 1, y: 0 }, []), id: 'd1' };
    const desk = { ...createObject('furniture', { x: 2, y: 2 }, []), id: 'f1' };
    let content = { ...emptyContent(), objects: [door, desk] };
    const r = applyPlanCommand(content, { type: 'object/update', id: 'd1', patch: { hinge: 'right' } });
    if (!r.ok) throw new Error(r.error.message);
    content = r.value;
    expect(content.objects.find((o) => o.id === 'd1')).toMatchObject({ hinge: 'right' });
    expect(applyPlanCommand(content, { type: 'object/update', id: 'f1', patch: { hinge: 'left' } })).toMatchObject({ ok: false, error: { message: 'F-01 is not a door.' } });
  });

  it('turns a door into a sliding door, and refuses it for anything else', () => {
    const door = { ...createObject('door', { x: 1, y: 0 }, []), id: 'd1' };
    const desk = { ...createObject('furniture', { x: 2, y: 2 }, []), id: 'f1' };
    const content = { ...emptyContent(), objects: [door, desk] };
    const r = applyPlanCommand(content, { type: 'object/update', id: 'd1', patch: { opening: 'slide' } });
    if (!r.ok) throw new Error(r.error.message);
    expect(r.value.objects.find((o) => o.id === 'd1')).toMatchObject({ opening: 'slide' });
    expect(applyPlanCommand(content, { type: 'object/update', id: 'f1', patch: { opening: 'slide' } })).toMatchObject({ ok: false, error: { message: 'F-01 is not a door.' } });
  });
});
