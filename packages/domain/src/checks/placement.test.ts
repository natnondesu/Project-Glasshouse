import { describe, expect, it } from 'vitest';
import { emptyContent } from '../factories';
import type { PlanContent, Rack, RoomObject, SimpleObject } from '../model/types';
import { createObject } from '../objects';
import { checkPlan } from './index';

const rackAt = (name: string, x: number, y: number, extra: Partial<Rack> = {}): Rack =>
  ({ ...(createObject('rack', { x, y }, []) as Rack), name, ...extra });
const obj = (type: 'existing_rack' | 'door' | 'mcb' | 'furniture', name: string, x: number, y: number, w?: number, d?: number): RoomObject => {
  const o = createObject(type, { x, y }, []);
  return { ...o, name, w: w ?? o.w, d: d ?? o.d };
};
const content = (objects: RoomObject[], survey: Partial<PlanContent['survey']> = {}): PlanContent => {
  const base = emptyContent();
  return { ...base, survey: { ...base.survey, width: 6, length: 4.8, floorAreas: [{ id: 'a', x: 0, y: 0, w: 6, d: 3 }, { id: 'b', x: 0, y: 3, w: 3.6, d: 1.8 }], ...survey }, objects };
};
const codes = (c: PlanContent) => checkPlan(c).map((i) => `${i.severity}:${i.code}`);

describe('placement checks', () => {
  it('blocks an empty footprint and warns on disconnected areas', () => {
    expect(codes(content([], { floorAreas: [] }))).toEqual(['block:footprint_empty']);
    expect(codes(content([], { floorAreas: [{ id: 'a', x: 0, y: 0, w: 1, d: 1 }, { id: 'b', x: 3, y: 0, w: 1, d: 1 }] }))).toEqual(['warn:footprint_disconnected']);
  });

  it('AC02: flags an object left in a cut-out instead of deleting it', () => {
    const c = content([rackAt('RK-01', 5.4, 0.6, { clearance: { front: 0, rear: 0 } })], { cutOuts: [{ id: 'c', x: 5.3, y: 1, w: 0.7, d: 0.6 }] });
    const issues = checkPlan(c);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ code: 'object_outside_footprint', severity: 'block', message: 'RK-01 is not fully on the floor.' });
  });

  it('exempts doors from footprint containment', () => {
    expect(codes(content([obj('door', 'D-01', 4, 3.0)]))).toEqual([]);
  });

  it('blocks overlap but allows edge contact', () => {
    const a = obj('furniture', 'F-01', 1, 3.5, 1, 0.6);
    expect(codes(content([a, obj('furniture', 'F-02', 2, 3.5, 1, 0.6)]))).toEqual([]);
    expect(codes(content([a, obj('furniture', 'F-02', 1.5, 3.5, 1, 0.6)]))).toEqual(['block:object_overlap']);
  });

  it('AC03: no false collision from bounding boxes of rotated objects', () => {
    const stick = { ...obj('furniture', 'F-01', 1, 0.5, 0.2, 2), angle: 37 };
    const box = obj('furniture', 'F-02', 1, 0.5, 0.2, 0.2);
    expect(codes(content([stick, box]))).toEqual([]);
  });
});

describe('clearance checks', () => {
  it('blocks a rear clearance that runs into the wall', () => {
    const issues = checkPlan(content([rackAt('RK-01', 1, 0)]));
    expect(issues.map((i) => i.message)).toEqual(['The rear clearance of RK-01 runs outside the floor.']);
  });

  it('AC11: an existing rack in the front zone blocks; a door only warns', () => {
    const rack = rackAt('RK-C1', 3.4, 0.6);
    const blocked = checkPlan(content([rack, obj('existing_rack', 'EX-01', 3.8, 2.2, 0.6, 0.8)]));
    expect(blocked).toHaveLength(1);
    expect(blocked[0]).toMatchObject({ code: 'clearance_obstructed', severity: 'block', message: 'EX-01 sits inside the front clearance zone of RK-C1.', targets: [expect.any(String), rack.id] });
    const door = checkPlan(content([rack, obj('door', 'D-01', 3.3, 2.0, 0.9, 0.1)]));
    expect(door.map((i) => `${i.severity}:${i.code}`)).toEqual(['warn:clearance_door']);
    // A sliding door has no swing to hit the rack: still a doorway in the zone, with its own wording.
    const sliding = checkPlan(content([rack, { ...(obj('door', 'D-01', 3.3, 2.0, 0.9, 0.1) as SimpleObject), opening: 'slide' as const }]));
    expect(sliding).toEqual([
      expect.objectContaining({ severity: 'warn', code: 'clearance_sliding_door', hint: 'Usually fine: a sliding door needs no swing space. Keep the opening itself clear.' }),
    ]);
  });

  it('allows racks sharing an aisle (overlapping zones)', () => {
    const top = rackAt('RK-01', 1, 0.6);
    const bottom = rackAt('RK-02', 1, 2.87, { angle: 180 });
    expect(codes(content([top, bottom], { floorAreas: [{ id: 'a', x: 0, y: 0, w: 6, d: 4.8 }] }))).toEqual([]);
  });

  it('skips a side with zero clearance and sorts blocks before warnings', () => {
    expect(codes(content([rackAt('RK-01', 1, 0, { clearance: { front: 1, rear: 0 } })]))).toEqual([]);
    const mixed = content([rackAt('RK-01', 1, 0), obj('door', 'D-01', 0.9, 1.9, 0.9, 0.1)]);
    expect(codes(mixed)).toEqual(['block:clearance_outside_footprint', 'warn:clearance_door']);
  });
});
