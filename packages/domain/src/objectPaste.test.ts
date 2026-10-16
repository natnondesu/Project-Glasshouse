import { describe, expect, it } from 'vitest';
import { applyPlanCommand, type PlanCommand } from './commands/plan';
import { emptyContent } from './factories';
import { unknownDemand } from './demand';
import type { PlanContent, Rack, Template } from './model/types';
import { createObject } from './objects';
import { copyName, innerIds, pasteSpot } from './objectPaste';

const SERVER: Template = {
  id: 'tpl-srv', version: 1, label: 'Server', model: 'X', category: 'server', mounting: 'rack', heightU: 2, depthMm: 700,
  demand: { kind: 'known', watts: 400 }, color: '', defaultConfig: '', slotCount: null, slotsPerRow: null, illustrative: false,
  ports: [{ count: 1, prefix: 'eth', start: 0, media: 'rj45', speed: '1G' }],
};
function run(c: PlanContent, ...cmds: PlanCommand[]): PlanContent {
  return cmds.reduce((acc, cmd) => {
    const r = applyPlanCommand(acc, cmd);
    if (!r.ok) throw new Error(r.error.message);
    return r.value;
  }, c);
}
const rack = { ...(createObject('rack', { x: 1, y: 1 }, []) as Rack), id: 'rk', name: 'Neopolis-01' };
const room = (): PlanContent =>
  run(
    emptyContent(),
    { type: 'object/add', object: rack },
    { type: 'device/place', id: 'srv', rackId: 'rk', bottomU: 1, template: SERVER },
    { type: 'device/update', id: 'srv', patch: { name: 'Neopolis-Compute-01' } },
    { type: 'reserved/add', rackId: 'rk', range: { id: 'res', label: 'Customer', bottomU: 30, heightU: 4, demand: unknownDemand(), notes: '' } },
  );

describe('copyName', () => {
  it('takes the next free number with the same width, or adds a counter', () => {
    expect(copyName(['Neopolis-01', 'Neopolis-03'], 'Neopolis-01')).toBe('Neopolis-04');
    expect(copyName(['RK-9'], 'RK-9')).toBe('RK-10');
    expect(copyName(['Desk', 'Desk-2'], 'Desk')).toBe('Desk-3');
  });
});

describe('object/paste', () => {
  it('copies a rack beside the original with new IDs and names, devices and all, but no cables or feeds', () => {
    const c = room();
    const source = c.objects[0] as Rack;
    const at = pasteSpot(c, source, source)!;
    const b = source.angle % 180 === 0 ? source.w : source.d;
    expect(at).toEqual({ x: source.x + b, y: source.y });
    const ids = Object.fromEntries(innerIds(source).map((id) => [id, `${id}-copy`]));
    const next = run(c, { type: 'object/paste', id: 'rk2', source, at, ids, templates: c.templatesUsed });
    const copy = next.objects.find((o) => o.id === 'rk2') as Rack;
    expect(copy.name).toBe('Neopolis-02');
    expect(copy.devices.map((d) => [d.id, d.name])).toEqual([['srv-copy', 'Neopolis-Compute-02']]);
    expect(copy.reserved.map((r) => r.id)).toEqual(['res-copy']);
    expect(next.links).toEqual(c.links);
    expect(next.feeds).toEqual(c.feeds);
  });

  it('refuses IDs already in the room, and a spot outside it', () => {
    const c = room();
    const source = c.objects[0] as Rack;
    const r = applyPlanCommand(c, { type: 'object/paste', id: 'rk2', source, at: { x: 2, y: 1 }, ids: { srv: 'srv', res: 'res2' }, templates: c.templatesUsed });
    expect(r).toMatchObject({ ok: false, error: { message: 'A device with this ID already exists.' } });
    const out = applyPlanCommand(c, { type: 'object/paste', id: 'rk2', source, at: { x: 99, y: 1 }, ids: { srv: 'a', res: 'b' }, templates: c.templatesUsed });
    expect(out).toMatchObject({ ok: false, error: { code: 'out_of_bounds' } });
  });

  it('walks to the next free side when the right is taken or past the wall', () => {
    const c = room();
    const source = c.objects[0] as Rack;
    const wall = { ...source, x: c.survey.width - source.w };
    expect(pasteSpot(c, source, wall)!.x).toBeLessThan(wall.x);
  });

  it('with every side taken, lands on the nearest free spot instead of on top of something', () => {
    const c = room();
    const source = c.objects[0] as Rack;
    const boxed = run(
      c,
      ...[[source.x + source.w, source.y], [source.x - source.w, source.y], [source.x, source.y + source.d], [source.x, source.y - source.d]]
        .filter(([x, y]) => x! >= 0 && y! >= 0)
        .map(([x, y], i) => ({ type: 'object/add', object: { ...createObject('furniture', { x: x!, y: y! }, []), id: `f${i}`, name: `F-${i}`, w: source.w, d: source.d } }) as PlanCommand),
    );
    const at = pasteSpot(boxed, source, source)!;
    const clash = boxed.objects.some((o) => at.x < o.x + o.w && o.x < at.x + source.w && at.y < o.y + o.d && o.y < at.y + source.d);
    expect(clash).toBe(false);
  });
});

