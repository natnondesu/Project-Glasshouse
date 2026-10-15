import { emptyContent, placementWithin, type PlanContent } from '@glasshouse/domain';
import { expect, it } from 'vitest';
import { placementAt } from './placement';

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
