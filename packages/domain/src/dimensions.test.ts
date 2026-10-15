import { describe, expect, it } from 'vitest';
import { applyPlanCommand } from './commands/plan';
import { anchorAt, dimensionLength, dimensionPoints, offsetFromPoint } from './dimensions';
import { emptyContent } from './factories';
import { migrate } from './migrations';
import { parseWorkspace } from './schema';
import type { Dimension, PlanContent, Rack } from './model/types';
import { createObject } from './objects';

const rack = (): Rack => ({ ...(createObject('rack', { x: 1, y: 1 }, []) as Rack), id: 'rk', name: 'RK-01' });

function withRack(): PlanContent {
  const r = applyPlanCommand(emptyContent(), { type: 'object/add', object: rack() });
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
}

function run(content: PlanContent, ...cmds: Parameters<typeof applyPlanCommand>[1][]): PlanContent {
  return cmds.reduce((c, cmd) => {
    const r = applyPlanCommand(c, cmd);
    if (!r.ok) throw new Error(r.error.message);
    return r.value;
  }, content);
}

describe('persistent dimensions', () => {
  it('anchors to an object corner and follows the object when it moves', () => {
    const content = withRack();
    const dim: Dimension = { id: 'd1', a: { kind: 'point', x: 0, y: 1 }, b: anchorAt(content, [1, 1], 'rk'), offset: 0.3 };
    expect(dim.b).toEqual({ kind: 'object', objectId: 'rk', u: -0.5, v: -0.5 });
    let next = run(content, { type: 'dimension/add', dimension: dim });
    expect(dimensionLength(next, next.dimensions[0]!)).toBeCloseTo(1, 6);
    next = run(next, { type: 'object/update', id: 'rk', patch: { x: 1.5 } });
    expect(dimensionLength(next, next.dimensions[0]!)).toBeCloseTo(1.5, 6);
    next = run(next, { type: 'object/rotate', id: 'rk', by: 45 });
    const [, b] = dimensionPoints(next, next.dimensions[0]!)!;
    expect(b).not.toEqual([1.5, 1]);
  });

  it('removes dimensions with their object, and undo-able content keeps both together', () => {
    const content = run(withRack(), { type: 'dimension/add', dimension: { id: 'd1', a: { kind: 'point', x: 0, y: 1 }, b: { kind: 'object', objectId: 'rk', u: -0.5, v: -0.5 }, offset: 0 } });
    const next = run(content, { type: 'object/remove', id: 'rk' });
    expect(next.dimensions).toEqual([]);
  });

  it('rejects zero-length dimensions and unknown objects with plain messages', () => {
    const content = withRack();
    expect(applyPlanCommand(content, { type: 'dimension/add', dimension: { id: 'd', a: { kind: 'point', x: 1, y: 1 }, b: { kind: 'point', x: 1, y: 1 }, offset: 0 } })).toMatchObject({
      ok: false,
      error: { message: 'Pick two different points.' },
    });
    expect(applyPlanCommand(content, { type: 'dimension/add', dimension: { id: 'd', a: { kind: 'point', x: 0, y: 0 }, b: { kind: 'object', objectId: 'gone', u: 0, v: 0 }, offset: 0 } })).toMatchObject({
      ok: false,
      error: { code: 'not_found' },
    });
  });

  it('moves the dimension line and removes it', () => {
    let c = run(withRack(), { type: 'dimension/add', dimension: { id: 'd1', a: { kind: 'point', x: 0, y: 0 }, b: { kind: 'point', x: 2, y: 0 }, offset: 0 } });
    c = run(c, { type: 'dimension/update', id: 'd1', patch: { offset: -0.4 } });
    expect(c.dimensions[0]!.offset).toBe(-0.4);
    c = run(c, { type: 'dimension/remove', id: 'd1' });
    expect(c.dimensions).toEqual([]);
  });

  it('upgrades schema 1 workspaces by giving every revision an empty dimension list', () => {
    const v1 = {
      schemaVersion: 1,
      catalog: [],
      lastBackupAt: null,
      projects: [{ id: 'p', name: 'P', notes: '', isSample: false, sites: [{ id: 's', name: 'S', notes: '', rooms: [{ id: 'r', name: 'R', notes: '', plan: { notes: [], history: [], revisions: [{ number: 1, state: 'draft', designedBy: null, approvedBy: null, submittedAt: null, approvedAt: null, acknowledgements: [], content: { ...emptyContent(), dimensions: undefined } }] } }] }] }],
    };
    const migrated = migrate(JSON.parse(JSON.stringify(v1)));
    expect(migrated.ok).toBe(true);
    const parsed = parseWorkspace(JSON.parse(JSON.stringify(v1)));
    if (!parsed.ok) throw new Error(parsed.error.message);
    expect(parsed.value.schemaVersion).toBe(8);
    expect(parsed.value.projects[0]!.sites[0]!.rooms[0]!.plan.revisions[0]!.content.dimensions).toEqual([]);
  });
});

describe('offsetFromPoint', () => {
  it('gives the signed distance of a point from the measured line along (−Δy, Δx), snapped to 5 cm', () => {
    // a→b runs along +x, so the positive side is +y: further down the plan.
    expect(offsetFromPoint([0, 0], [2, 0], [1, 0.42])).toBeCloseTo(0.4, 9);
    expect(offsetFromPoint([0, 0], [2, 0], [1, -0.33])).toBeCloseTo(-0.35, 9);
    expect(offsetFromPoint([0, 0], [0, 0], [1, 1])).toBe(0);
  });
});
