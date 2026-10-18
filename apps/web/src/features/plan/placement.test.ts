import { createObject, emptyContent, placementWithin, type PlanContent, type RoomObject } from '@glasshouse/domain';
import { describe, expect, it } from 'vitest';
import { placementAt, snapMoved } from './placement';

const room: PlanContent = { ...emptyContent(), survey: { ...emptyContent().survey, width: 6, length: 5, floorAreas: [{ id: 'a', x: 0, y: 0, w: 6, d: 5 }] } };

it('keeps objects whose size is off the 10 cm grid inside the room near a wall', () => {
  const ups = placementAt('ups', [1.2, 4.95], room);
  expect(placementWithin(ups, 6, 5)).toBe(true);
  const rack = placementAt('rack', [5.95, 4.95], room);
  expect(placementWithin(rack, 6, 5)).toBe(true);
});

it('snaps to the floor grid away from the walls, and puts wall-mounted sources on the wall', () => {
  expect(placementAt('ups', [2.04, 1.96], room)).toMatchObject({ x: 2, y: 2 });
  expect(placementAt('wall_plug', [3, 0.2], room)).toMatchObject({ y: 0, angle: 0 });
});

it('places a sliding door as a door that slides', () => {
  expect(placementAt('sliding_door', [3, 2], room)).toMatchObject({ type: 'door', opening: 'slide' });
  expect(placementAt('door', [3, 2], room)).not.toHaveProperty('opening');
});

it('hangs a wall rack on the nearest wall: 12U, bottom at 1.20 m, no rear clearance, front to the room', () => {
  const r = placementAt('wall_rack', [3, 0.3], room);
  expect(r).toMatchObject({ type: 'rack', capacityU: 12, wallBottomM: 1.2, y: 0, angle: 0, clearance: { rear: 0 } });
});

describe('doors snap to walls and partitions', () => {
  const wall = { ...createObject('partition', { x: 2, y: 2 }, []), id: 'pt', name: 'PT-01' } as RoomObject;
  const withWall: PlanContent = { ...room, objects: [wall] };

  it('stands a door against the outer wall facing in, the way the wall rack hangs', () => {
    expect(placementAt('door', [3, 0.15], room)).toMatchObject({ type: 'door', y: 0, angle: 0 });
    expect(placementAt('door', [0.1, 2.5], room)).toMatchObject({ type: 'door', x: 0, angle: 270 });
    expect(placementAt('sliding_door', [3, 4.9], room)).toMatchObject({ opening: 'slide', angle: 180 });
  });

  it('leaves a door free when it is dropped away from every wall', () => {
    expect(placementAt('door', [3, 2.55], room)).toMatchObject({ angle: 0, x: 3, y: 2.5 });
  });

  it('snaps a door into a partition, on the side the pointer is on', () => {
    const north = placementAt('door', [3, 1.8], withWall);
    expect(north).toMatchObject({ angle: 180 });
    expect(north.y).toBeCloseTo(2);
    expect(placementAt('door', [3, 2.3], withWall)).toMatchObject({ angle: 0 });
  });
});

describe('wall-hung tools', () => {
  const wall = { ...createObject('partition', { x: 2, y: 2 }, []), id: 'pt', name: 'PT-01' } as RoomObject;

  it('hang the split AC and the display wall on the nearest wall, at their default heights', () => {
    expect(placementAt('wall_split_ac', [3, 0.4], room)).toMatchObject({ type: 'wall_split_ac', y: 0, angle: 0, wallBottomM: 2.2 });
    expect(placementAt('display_wall', [5.9, 2.5], room)).toMatchObject({ type: 'display_wall', angle: 90, wallBottomM: 0.8 });
  });

  it('hang them on a partition face too, facing the side the pointer is on', () => {
    const ac = placementAt('wall_split_ac', [3, 2.4], { ...room, objects: [wall] });
    expect(ac.angle).toBe(0);
    expect(ac.y).toBeCloseTo(2.1);
  });

  it('keep a floor-standing precision AC on the grid', () => {
    expect(placementAt('precision_ac', [2.04, 1.96], room)).toMatchObject({ type: 'precision_ac', x: 2, y: 2, angle: 0 });
  });
});

describe('partition tool', () => {
  it('puts the default 2.00 m wall along X, centred on the pointer', () => {
    const p = placementAt('partition', [3, 2.5], room);
    expect(p).toMatchObject({ type: 'partition', w: 2, d: 0.1, angle: 0 });
    expect(p.x + p.w / 2).toBeCloseTo(3, 0);
    expect(p.y + p.d / 2).toBeCloseTo(2.5, 0);
  });

  it('stays inside the room near a wall', () => {
    expect(placementWithin(placementAt('partition', [0.2, 0.1], room), 6, 5)).toBe(true);
    expect(placementWithin(placementAt('partition', [5.9, 4.95], room), 6, 5)).toBe(true);
  });
});

describe('moving a door or a wall-hung item', () => {
  const door = { ...createObject('door', { x: 3, y: 2 }, []), id: 'd' } as RoomObject;
  const ac = { ...createObject('wall_split_ac', { x: 1, y: 0 }, []), id: 'a' } as RoomObject;

  it('snaps a dragged door to the wall within reach, and says nothing for one in the open', () => {
    expect(snapMoved(door, [3, 0.2], room)).toMatchObject({ y: 0, angle: 0 });
    expect(snapMoved(door, [3, 2.5], room)).toBeNull();
  });

  it('always puts a dragged wall item on the nearest wall', () => {
    expect(snapMoved(ac, [5.6, 3], room)).toMatchObject({ angle: 90 });
  });

  it('has no opinion about other objects', () => {
    expect(snapMoved({ ...createObject('furniture', { x: 1, y: 1 }, []), id: 'f' } as RoomObject, [1, 0.1], room)).toBeNull();
  });
});
