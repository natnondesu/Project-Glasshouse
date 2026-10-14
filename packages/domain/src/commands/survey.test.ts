import { describe, expect, it } from 'vitest';
import { emptyContent } from '../factories';
import type { PlanContent } from '../model/types';
import { applyPlanCommand } from './plan';
import { cutOutKind } from '../footprint';

function run(content: PlanContent, ...cmds: Parameters<typeof applyPlanCommand>[1][]): PlanContent {
  return cmds.reduce((c, cmd) => {
    const r = applyPlanCommand(c, cmd);
    if (!r.ok) throw new Error(r.error.message);
    return r.value;
  }, content);
}

describe('survey', () => {
  it('starts as a 5 × 4 m room with one full floor area', () => {
    const c = emptyContent();
    expect(c.survey).toMatchObject({ width: 5, length: 4, powerBudget: 5000, designLimitPct: 80 });
    expect(c.survey.floorAreas).toHaveLength(1);
    expect(c.survey.floorAreas[0]).toMatchObject({ x: 0, y: 0, w: 5, d: 4 });
  });

  it('resizes the default floor area with the room', () => {
    const c = run(emptyContent(), { type: 'survey/update', patch: { width: 6.04, length: 4.8 } });
    expect(c.survey.width).toBe(6);
    expect(c.survey.floorAreas[0]).toMatchObject({ w: 6, d: 4.8 });
  });

  it('rejects out-of-range values with a plain message', () => {
    const r = applyPlanCommand(emptyContent(), { type: 'survey/update', patch: { width: 0.5 } });
    expect(r).toMatchObject({ ok: false, error: { code: 'invalid_value', message: 'Room width must be between 1 and 50 m.' } });
    expect(applyPlanCommand(emptyContent(), { type: 'survey/update', patch: { powerBudget: 50 } }).ok).toBe(false);
    expect(applyPlanCommand(emptyContent(), { type: 'survey/update', patch: { designLimitPct: 120 } }).ok).toBe(false);
  });

  it('keeps custom floor areas and refuses to shrink past them', () => {
    const base = run(emptyContent(), { type: 'floor/add', rect: { id: 'x', x: 3, y: 0, w: 2, d: 1 } });
    const r = applyPlanCommand(base, { type: 'survey/update', patch: { width: 4 } });
    expect(r).toMatchObject({ ok: false, error: { code: 'out_of_bounds', targets: expect.any(Array) } });
  });

  it('updates power, design limit and text fields', () => {
    const c = run(emptyContent(), {
      type: 'survey/update',
      patch: { powerBudget: 9000.4, designLimitPct: 75, networkHandoff: 'Customer core, port 24', notes: 'Raised floor' },
    });
    expect(c.survey).toMatchObject({ powerBudget: 9000, designLimitPct: 75, networkHandoff: 'Customer core, port 24' });
  });
});

describe('floor areas and cut-outs', () => {
  it('builds an L-shape by resizing the first area and adding a second', () => {
    const base = run(emptyContent(), { type: 'survey/update', patch: { width: 6, length: 4.8 } });
    const first = base.survey.floorAreas[0]!;
    const c = run(
      base,
      { type: 'floor/update', id: first.id, patch: { d: 3 } },
      { type: 'floor/add', rect: { id: 'b', x: 0, y: 3, w: 3.62, d: 1.8 } },
    );
    expect(c.survey.floorAreas.map((r) => [r.w, r.d])).toEqual([[6, 3], [3.6, 1.8]]);
  });

  it('adds, updates and removes rectangles', () => {
    let c = emptyContent();
    c = run(c, { type: 'floor/cut', rect: { id: 'cut', x: 4.42, y: 0, w: 0.61, d: 0.6 } });
    expect(c.survey.cutOuts[0]).toMatchObject({ x: 4.4, w: 0.6 });
    c = run(c, { type: 'floor/update', id: 'cut', patch: { w: 0.5 } });
    expect(c.survey.cutOuts[0]?.w).toBe(0.5);
    c = run(c, { type: 'floor/remove', id: 'cut' });
    expect(c.survey.cutOuts).toEqual([]);
  });

  it('rejects tiny, out-of-bounds, duplicate and missing rectangles', () => {
    const c = emptyContent();
    expect(applyPlanCommand(c, { type: 'floor/add', rect: { id: 'a', x: 0, y: 0, w: 0.04, d: 1 } }).ok).toBe(false);
    expect(applyPlanCommand(c, { type: 'floor/add', rect: { id: 'a', x: 4.5, y: 0, w: 1, d: 1 } })).toMatchObject({
      ok: false,
      error: { code: 'out_of_bounds' },
    });
    const first = c.survey.floorAreas[0]!;
    expect(applyPlanCommand(c, { type: 'floor/add', rect: { ...first } }).ok).toBe(false);
    expect(applyPlanCommand(c, { type: 'floor/remove', id: 'nope' })).toMatchObject({ ok: false, error: { code: 'not_found' } });
    expect(applyPlanCommand(c, { type: 'floor/update', id: 'nope', patch: {} }).ok).toBe(false);
  });

  it('allows removing the last floor area while building', () => {
    const c = emptyContent();
    const r = applyPlanCommand(c, { type: 'floor/remove', id: c.survey.floorAreas[0]!.id });
    expect(r.ok && r.value.survey.floorAreas).toEqual([]);
  });

  it('never mutates its input', () => {
    const c = emptyContent();
    const before = JSON.parse(JSON.stringify(c)) as typeof c;
    applyPlanCommand(c, { type: 'survey/update', patch: { width: 8 } });
    expect(c).toEqual(before);
  });
});

describe('cut-out kind', () => {
  it('marks a cut-out as a void or a wall/column; areas have no kind', () => {
    let c = emptyContent();
    const cut = applyPlanCommand(c, { type: 'floor/cut', rect: { id: 'c', x: 1, y: 1, w: 0.5, d: 0.5 } });
    if (!cut.ok) throw new Error(cut.error.message);
    c = cut.value;
    expect(cutOutKind(c.survey.cutOuts[0]!)).toBe('solid');
    const voided = applyPlanCommand(c, { type: 'floor/update', id: 'c', patch: { kind: 'void' } });
    expect(voided.ok && voided.value.survey.cutOuts[0]!.kind).toBe('void');
    const areaId = c.survey.floorAreas[0]!.id;
    expect(applyPlanCommand(c, { type: 'floor/update', id: areaId, patch: { kind: 'void' } })).toMatchObject({ ok: false, error: { message: 'Only cut-outs can be a void or a wall/column.' } });
  });
});
