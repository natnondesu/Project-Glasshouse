import { describe, expect, it } from 'vitest';
import { applyPlanCommand, type PlanCommand } from '../commands/plan';
import { emptyContent } from '../factories';
import type { PlanContent, Rack, RoomObject, SimpleObject } from '../model/types';
import { createObject, keepClearOf } from '../objects';
import { checkPlan } from './index';
import { environmentZone } from './environment';

const content = (objects: RoomObject[]): PlanContent => {
  const base = emptyContent();
  return { ...base, survey: { ...base.survey, width: 8, length: 6, floorAreas: [{ id: 'a', x: 0, y: 0, w: 8, d: 6 }] }, objects };
};
const make = (type: SimpleObject['type'], name: string, x: number, y: number, extra: Partial<SimpleObject> = {}): SimpleObject =>
  ({ ...(createObject(type, { x, y }, []) as SimpleObject), id: name.toLowerCase(), name, ...extra });
const rack = (name: string, x: number, y: number, extra: Partial<Rack> = {}): Rack =>
  ({ ...(createObject('rack', { x, y }, []) as Rack), id: name.toLowerCase(), name, clearance: { front: 0, rear: 0 }, ...extra });
const codes = (c: PlanContent) => checkPlan(c).map((i) => i.code);
const run = (c: PlanContent, cmd: PlanCommand) => applyPlanCommand(c, cmd);
const depthOf = (o: RoomObject): number => {
  const zone = environmentZone(o);
  return zone ? Math.max(...zone.flat().map((p) => p[1])) - (o.y + o.d) : NaN;
};

describe('keep-clear depth', () => {
  it('defaults are unchanged when the field is absent', () => {
    expect(keepClearOf(make('wall_split_ac', 'A', 1, 0))).toBe(1);
    expect(keepClearOf(make('precision_ac', 'P', 1, 0))).toBe(1);
    expect(keepClearOf(make('display_wall', 'D', 1, 0))).toBe(1.5);
    expect(keepClearOf(make('furniture', 'F', 1, 0))).toBeNull();
    expect(keepClearOf(rack('R', 1, 0))).toBeNull();
  });

  it('a custom depth moves the zone boundary, rotated too', () => {
    const pac = make('precision_ac', 'PAC-01', 3, 2, { keepClearM: 0.5 });
    expect(depthOf(pac)).toBeCloseTo(0.5);
    // front edge of the cabinet is y 2.8; a rack at 3.4 is outside 0.5 m but inside the 1.00 m default
    expect(codes(content([pac, rack('RK-01', 3, 3.4)]))).not.toContain('precision_ac_service');
    expect(codes(content([{ ...pac, keepClearM: undefined } as SimpleObject, rack('RK-01', 3, 3.4)]))).toContain('precision_ac_service');
    expect(codes(content([pac, rack('RK-01', 3, 3.2)]))).toContain('precision_ac_service');
    const east = make('precision_ac', 'PAC-01', 6, 2, { angle: 90, keepClearM: 0.5 });
    expect(codes(content([east, rack('RK-01', 4.6, 2.0)]))).not.toContain('precision_ac_service');
    expect(codes(content([east, rack('RK-01', 5.2, 2.0)]))).toContain('precision_ac_service');
  });

  it('a larger depth reaches further for the airflow and the viewing area', () => {
    const ac = make('wall_split_ac', 'AC-01', 2.5, 0, { keepClearM: 2 });
    expect(codes(content([ac, rack('RK-01', 2.6, 1.6)]))).toContain('wall_ac_airflow');
    const dw = make('display_wall', 'DW-01', 2, 0, { keepClearM: 3 });
    expect(codes(content([dw, rack('RK-01', 2.5, 2.5)]))).toContain('display_wall_view');
  });

  it('0 means no zone: none is built and none of its warnings fire', () => {
    for (const type of ['wall_split_ac', 'precision_ac', 'display_wall'] as const) {
      const unit = make(type, 'U-01', 2.5, 0, { keepClearM: 0 });
      expect(environmentZone(unit)).toBeNull();
      expect(codes(content([unit, rack('RK-01', 2.6, unit.d + 0.2)]))).toEqual([]);
    }
  });

  it('the drip warning still fires with keep-clear 0', () => {
    const ac = make('wall_split_ac', 'AC-01', 2.5, 0, { keepClearM: 0 });
    expect(codes(content([ac, rack('RK-01', 2.5, 0)]))).toContain('wall_ac_drip');
  });

  it('the messages quote the effective depth', () => {
    const msg = (c: PlanContent, code: string) => checkPlan(c).find((i) => i.code === code);
    const pac = make('precision_ac', 'PAC-01', 3, 2, { keepClearM: 0.6 });
    const issue = msg(content([pac, rack('RK-02', 3, 3.0)]), 'precision_ac_service');
    expect(issue?.message).toBe('Keep 0.60 m clear in front of the precision AC for service; RK-02 is in the way.');
    expect(issue?.params).toMatchObject({ depth: '0.60' });
    expect(msg(content([make('wall_split_ac', 'AC-01', 2.5, 0, { keepClearM: 2 }), rack('RK-01', 2.6, 1.6)]), 'wall_ac_airflow')?.message).toBe('RK-01 blocks the airflow within 2.00 m in front of the wall AC.');
    expect(msg(content([make('display_wall', 'DW-01', 2, 0), rack('RK-01', 2.5, 1.0)]), 'display_wall_view')?.message).toBe('RK-01 stands within 1.50 m in front of the display wall.');
  });
});

describe('keep-clear validation', () => {
  const room = (): PlanContent => content([]);
  const add = (o: RoomObject) => run(room(), { type: 'object/add', object: o });

  it('is accepted on the three types and refused on any other type', () => {
    for (const type of ['wall_split_ac', 'precision_ac', 'display_wall'] as const) expect(add(make(type, 'U-01', 2, 0, { keepClearM: 0.5 })).ok).toBe(true);
    for (const type of ['furniture', 'door', 'partition', 'ups'] as const) expect(add(make(type, 'X-01', 2, 2, { keepClearM: 0.5 })).ok).toBe(false);
    expect(add({ ...rack('RK-01', 2, 2), keepClearM: 0.5 } as unknown as RoomObject).ok).toBe(false);
  });

  it('is refused outside 0 to 5 m, accepting both ends', () => {
    for (const bad of [-0.1, 5.01, Number.NaN]) expect(add(make('precision_ac', 'P', 2, 0, { keepClearM: bad })).ok).toBe(false);
    for (const good of [0, 5]) expect(add(make('precision_ac', 'P', 2, 0, { keepClearM: good })).ok).toBe(true);
  });

  it('is set, cleared and refused by update', () => {
    const base = content([make('precision_ac', 'P', 2, 0), make('furniture', 'F', 5, 4), rack('R', 1, 3)]);
    const set = run(base, { type: 'object/update', id: 'p', patch: { keepClearM: 0.5 } });
    expect(set.ok && set.value.objects.find((o) => o.id === 'p')).toMatchObject({ keepClearM: 0.5 });
    const zero = run(base, { type: 'object/update', id: 'p', patch: { keepClearM: 0 } });
    expect(zero.ok && (zero.value.objects.find((o) => o.id === 'p') as SimpleObject).keepClearM).toBe(0);
    if (!set.ok) throw new Error();
    const cleared = run(set.value, { type: 'object/update', id: 'p', patch: { keepClearM: null } });
    expect(cleared.ok && 'keepClearM' in cleared.value.objects.find((o) => o.id === 'p')!).toBe(false);
    expect(run(base, { type: 'object/update', id: 'p', patch: { keepClearM: 6 } }).ok).toBe(false);
    expect(run(base, { type: 'object/update', id: 'f', patch: { keepClearM: 1 } }).ok).toBe(false);
    expect(run(base, { type: 'object/update', id: 'r', patch: { keepClearM: 1 } }).ok).toBe(false);
  });

  it('copy and paste keep it', () => {
    const source = make('precision_ac', 'PAC-01', 2, 0, { keepClearM: 0.5 });
    const r = run(content([source]), { type: 'object/paste', id: 'pac2', source, at: { x: 5, y: 0 }, ids: {}, templates: [] });
    expect(r.ok && r.value.objects.find((o) => o.id === 'pac2')).toMatchObject({ keepClearM: 0.5, name: 'PAC-02' });
  });

  it('an old object with a stray value can still be edited, which drops it', () => {
    const stray = make('furniture', 'F', 5, 4, { keepClearM: 2 });
    const r = run(content([stray]), { type: 'object/update', id: 'f', patch: { notes: 'x' } });
    expect(r.ok && 'keepClearM' in r.value.objects[0]!).toBe(false);
  });
});
