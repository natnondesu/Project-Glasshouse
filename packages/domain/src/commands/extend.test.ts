import { describe, expect, it } from 'vitest';
import { emptyContent } from '../factories';
import type { PlanContent, Rack } from '../model/types';
import { createObject } from '../objects';
import { roomExtensionFor } from './extend';
import { applyPlanCommand } from './plan';

function room(): PlanContent {
  const rack = { ...(createObject('rack', { x: 1, y: 1 }, []) as Rack), id: 'rk', name: 'RK-01' };
  const r = applyPlanCommand(
    { ...emptyContent(), dimensions: [{ id: 'dm', a: { kind: 'point', x: 0, y: 0 }, b: { kind: 'object', objectId: 'rk', u: 0, v: 0 }, offset: 0.3 }] },
    { type: 'object/add', object: rack },
  );
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
}

describe('extending the room by drawing floor outside it', () => {
  it('says what a rect outside the 5 × 4 m bounds would need, and nothing for one inside', () => {
    const s = room().survey;
    expect(roomExtensionFor(s, { x: 1, y: 1, w: 1, d: 1 })).toBeNull();
    expect(roomExtensionFor(s, { x: 4, y: 3, w: 2, d: 2 })).toEqual({ width: 6, length: 5, dx: 0, dy: 0 });
    expect(roomExtensionFor(s, { x: -1, y: -0.5, w: 2, d: 1 })).toEqual({ width: 6, length: 4.5, dx: 1, dy: 0.5 });
  });

  it('grows the room to the right and down and adds the area', () => {
    const r = applyPlanCommand(room(), { type: 'floor/extend', rect: { id: 'f2', x: 4, y: 3, w: 2, d: 2 } });
    if (!r.ok) throw new Error(r.error.message);
    expect(r.value.survey).toMatchObject({ width: 6, length: 5 });
    expect(r.value.survey.floorAreas.at(-1)).toMatchObject({ id: 'f2', x: 4, y: 3, w: 2, d: 2 });
    expect(r.value.objects[0]).toMatchObject({ x: 1, y: 1 });
  });

  it('grows to the left and up by moving everything over, so the plan keeps its top-left origin', () => {
    const r = applyPlanCommand(room(), { type: 'floor/extend', rect: { id: 'f2', x: -1, y: -0.5, w: 2, d: 1 } });
    if (!r.ok) throw new Error(r.error.message);
    const c = r.value;
    expect(c.survey).toMatchObject({ width: 6, length: 4.5 });
    expect(c.survey.floorAreas[0]).toMatchObject({ x: 1, y: 0.5, w: 5, d: 4 });
    expect(c.survey.floorAreas.at(-1)).toMatchObject({ id: 'f2', x: 0, y: 0, w: 2, d: 1 });
    expect(c.objects[0]).toMatchObject({ x: 2, y: 1.5 });
    // A dimension pinned to a point moves with the room; one on an object moves with the object.
    expect(c.dimensions[0]!.a).toEqual({ kind: 'point', x: 1, y: 0.5 });
    expect(c.dimensions[0]!.b).toEqual({ kind: 'object', objectId: 'rk', u: 0, v: 0 });
  });

  it('refuses a room past 50 m and an area smaller than 0.10 m', () => {
    expect(applyPlanCommand(room(), { type: 'floor/extend', rect: { id: 'f', x: 0, y: 0, w: 60, d: 1 } })).toMatchObject({
      ok: false,
      error: { message: 'That would make the room 60.00 × 4.00 m; a room is at most 50 m on each side.' },
    });
    expect(applyPlanCommand(room(), { type: 'floor/extend', rect: { id: 'f', x: 5, y: 0, w: 0.04, d: 1 } }).ok).toBe(false);
  });
});
