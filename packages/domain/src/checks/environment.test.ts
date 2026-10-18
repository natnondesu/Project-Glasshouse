import { describe, expect, it } from 'vitest';
import { emptyContent } from '../factories';
import type { PlanContent, Rack, RoomObject, SimpleObject } from '../model/types';
import { applyPlanCommand } from '../commands/plan';
import { createObject, isWallHung, verticalSpan, wallBottomOf } from '../objects';
import { isPowerSource } from '../sources';
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
const env = (c: PlanContent) => checkPlan(c).filter((i) => i.severity === 'warn' && /ac_|display_wall/.test(i.code));
const codes = (c: PlanContent) => checkPlan(c).map((i) => i.code);

describe('wall split AC', () => {
  const ac = make('wall_split_ac', 'AC-01', 2.5, 0);

  it('warns about condensate on a rack, existing rack or wall rack standing under it', () => {
    for (const under of [rack('RK-01', 2.5, 0), make('existing_rack', 'EX-01', 2.5, 0), rack('WR-01', 2.5, 0, { wallBottomM: 1.2, capacityU: 12, w: 0.6, d: 0.5 })]) {
      const issues = env(content([ac, under]));
      expect(issues).toContainEqual(expect.objectContaining({ code: 'wall_ac_drip', severity: 'warn', message: `${under.name} stands under the wall AC; condensate can drip on it.`, targets: [under.id, ac.id] }));
    }
  });

  it('does not warn about a wall rack hung above the AC, only about what stands below its underside', () => {
    const above = rack('WR-01', 2.5, 0, { wallBottomM: 2.5, capacityU: 6, w: 0.6, d: 0.5 });
    expect(codes(content([ac, above]))).not.toContain('wall_ac_drip');
    const under = rack('WR-02', 2.5, 0, { wallBottomM: 1.2, capacityU: 12, w: 0.6, d: 0.5 });
    expect(codes(content([ac, under]))).toContain('wall_ac_drip');
  });

  it('does not treat a desk or a rack beside the AC as under it', () => {
    expect(codes(content([ac, make('furniture', 'F-01', 2.5, 0)]))).not.toContain('wall_ac_drip');
    expect(codes(content([ac, rack('RK-01', 3.4, 0)]))).not.toContain('wall_ac_drip');
  });

  it('a rack under the AC is a warning, not an overlap: the AC hangs above the rack', () => {
    expect(codes(content([ac, rack('RK-01', 2.5, 0)]))).not.toContain('object_overlap');
  });

  it('warns when a rack stands in the 1.00 m of airflow in front of the AC, but not beyond it', () => {
    const inside = env(content([ac, rack('RK-01', 2.6, 1.0)]));
    expect(inside.map((i) => i.code)).toEqual(['wall_ac_airflow']);
    expect(inside[0]).toMatchObject({ message: 'RK-01 blocks the airflow within 1.00 m in front of the wall AC.', targets: ['rk-01', 'ac-01'] });
    expect(env(content([ac, rack('RK-01', 2.6, 1.25)]))).toEqual([]);
    expect(env(content([ac, rack('RK-01', 2.6, 1.3)]))).toEqual([]);
    expect(env(content([ac, make('furniture', 'F-01', 2.6, 1.0)]))).toEqual([]);
  });

  it('follows the AC when it is turned: a split AC on the west wall blows east', () => {
    const west = make('wall_split_ac', 'AC-01', 0, 1.55, { angle: 270 });
    expect(env(content([west, rack('RK-01', 0.5, 1.7)])).map((i) => i.code)).toEqual(['wall_ac_airflow']);
    expect(env(content([west, rack('RK-01', 1.3, 1.7)]))).toEqual([]);
    expect(env(content([west, rack('RK-01', 0.5, 3.5)]))).toEqual([]);
  });

  it('is not an obstruction for the clearance zone of a rack standing below it', () => {
    const facing = rack('RK-01', 2.5, 1.2, { angle: 180, clearance: { front: 1.1, rear: 0 } });
    expect(codes(content([ac, facing]))).not.toContain('clearance_obstructed');
  });
});

describe('wall-hung items', () => {
  it('a split AC without a stored height gets the drip warning for a rack under it, not an overlap', () => {
    const { wallBottomM: _gone, ...bare } = make('wall_split_ac', 'AC-01', 2.5, 0);
    const issues = codes(content([bare, rack('RK-01', 2.5, 0)]));
    expect(issues).toContain('wall_ac_drip');
    expect(issues).not.toContain('object_overlap');
  });

  it('isWallHung is a plain yes/no: the split AC and display wall, nothing else', () => {
    expect([isWallHung(make('wall_split_ac', 'A', 0, 0)), isWallHung(make('display_wall', 'D', 0, 0))]).toEqual([true, true]);
    expect([isWallHung(make('furniture', 'F', 0, 0)), isWallHung(make('partition', 'P', 0, 0)), isWallHung(rack('R', 0, 0))]).toEqual([false, false, false]);
  });
});

describe('precision AC', () => {
  const pac = make('precision_ac', 'PAC-01', 3, 2);

  it('warns about anything but a door in the 1.00 m service zone in front of it', () => {
    const issues = env(content([pac, make('furniture', 'F-01', 3.2, 3.0)]));
    expect(issues).toEqual([expect.objectContaining({ code: 'precision_ac_service', severity: 'warn', message: 'Keep 1.00 m clear in front of the precision AC for service; F-01 is in the way.', targets: ['f-01', 'pac-01'] })]);
    expect(env(content([pac, rack('RK-01', 3.0, 3.5)])).map((i) => i.code)).toEqual(['precision_ac_service']);
    expect(env(content([pac, make('door', 'D-01', 3.0, 3.0)]))).toEqual([]);
    expect(env(content([pac, make('furniture', 'F-01', 3.2, 3.8)]))).toEqual([]);
    expect(env(content([pac, make('furniture', 'F-01', 5, 3.0)]))).toEqual([]);
  });

  it('only counts the front: an object behind or beside it is fine', () => {
    expect(env(content([pac, make('furniture', 'F-01', 3.2, 1.0)]))).toEqual([]);
    expect(env(content([pac, make('furniture', 'F-01', 4.0, 2.2)]))).toEqual([]);
  });

  it('ignores flush plugs and anything mounted above the cabinet', () => {
    expect(env(content([pac, make('wall_plug', 'WP-01', 3.2, 3.0)]))).toEqual([]);
    expect(env(content([pac, make('wall_split_ac', 'AC-01', 3.1, 3.0)]))).toEqual([]);
  });

  it('is turned with the cabinet', () => {
    const east = make('precision_ac', 'PAC-01', 6, 2, { angle: 90 });
    expect(env(content([east, make('furniture', 'F-01', 5.2, 2.2)])).map((i) => i.code)).toEqual(['precision_ac_service']);
    expect(env(content([east, make('furniture', 'F-01', 6.9, 2.2)]))).toEqual([]);
  });

  it('overlap with another object is the usual overlap block', () => {
    expect(codes(content([pac, make('furniture', 'F-01', 3.2, 2.2)]))).toContain('object_overlap');
  });
});

describe('display wall', () => {
  const dw = make('display_wall', 'DW-01', 2, 0);

  it('warns when a rack or existing rack stands in the 1.50 m viewing area, not for desks', () => {
    const issues = env(content([dw, rack('RK-01', 2.5, 1.0)]));
    expect(issues).toEqual([expect.objectContaining({ code: 'display_wall_view', severity: 'warn', message: 'RK-01 stands within 1.50 m in front of the display wall.', targets: ['rk-01', 'dw-01'] })]);
    expect(env(content([dw, make('existing_rack', 'EX-01', 2.5, 1.2)])).map((i) => i.code)).toEqual(['display_wall_view']);
    expect(env(content([dw, make('furniture', 'F-01', 2.5, 1.0)]))).toEqual([]);
    expect(env(content([dw, rack('RK-01', 2.5, 1.65)]))).toEqual([]);
    expect(env(content([dw, rack('RK-01', 5.2, 1.0)]))).toEqual([]);
  });

  it('is draw only: it asks for no power and is not a power source', () => {
    const c = content([dw]);
    expect(checkPlan(c)).toEqual([]);
    expect(c.feeds).toEqual([]);
    expect(isPowerSource(dw)).toBe(false);
    const fed = applyPlanCommand(content([dw, rack('RK-01', 5, 3)]), { type: 'feed/add', feed: { id: 'f', targetId: 'rk-01', sourceId: 'dw-01', label: 'Feed A' } });
    expect(fed.ok).toBe(false);
  });

  it('without a stored height (an imported file) still hangs at its default height', () => {
    const { wallBottomM: _gone, ...bare } = dw;
    expect(wallBottomOf(bare)).toBe(0.8);
    expect(verticalSpan(bare)[0]).toBe(0.8);
    // Something lower than the screen's bottom edge fits under it; a full rack does not.
    expect(codes(content([bare, rack('RK-01', 2.5, 0, { height: 0.7 })]))).not.toContain('object_overlap');
    expect(codes(content([bare, rack('RK-01', 2.5, 0)]))).toContain('object_overlap');
  });
});

describe('environment zones', () => {
  it('are the front areas the checks use, null for everything else', () => {
    const box = (z: ReturnType<typeof environmentZone>) => ({ xs: z!.flat().map((p) => p[0]), ys: z!.flat().map((p) => p[1]) });
    const ac = box(environmentZone(make('wall_split_ac', 'AC-01', 2.5, 0)));
    expect([Math.min(...ac.xs), Math.max(...ac.xs)]).toEqual([expect.closeTo(2.5), expect.closeTo(3.4)]);
    expect(Math.min(...ac.ys)).toBeCloseTo(0.25);
    expect(Math.max(...ac.ys)).toBeCloseTo(1.25);
    const dw = box(environmentZone(make('display_wall', 'DW-01', 2, 0)));
    expect([Math.min(...dw.xs), Math.max(...dw.xs)]).toEqual([expect.closeTo(2), expect.closeTo(5)]);
    expect(Math.max(...dw.ys)).toBeCloseTo(1.65);
    // Turned to the west wall, the zone runs east of the unit.
    const west = box(environmentZone(make('wall_split_ac', 'AC-01', 0, 1.55, { angle: 270 })));
    expect(Math.min(...west.xs)).toBeCloseTo(0.25);
    expect(Math.max(...west.xs)).toBeCloseTo(1.25);
    expect(environmentZone(make('precision_ac', 'PAC-01', 3, 2))).not.toBeNull();
    expect(environmentZone(make('furniture', 'F-01', 3, 2))).toBeNull();
    expect(environmentZone(rack('RK-01', 1, 1))).toBeNull();
  });
});
