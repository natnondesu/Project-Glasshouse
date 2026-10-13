import { expect, it } from 'vitest';
import { clampIntoRoom } from './clamp';

it('stops a dragged object at the walls instead of letting it leave the room', () => {
  const rack = { w: 0.6, d: 1, angle: 0 };
  expect(clampIntoRoom(rack, 4.9, -0.3, { width: 5, length: 4 })).toEqual({ x: 4.4, y: 0 });
  expect(clampIntoRoom({ ...rack, angle: 90 }, 4.9, 3.9, { width: 5, length: 4 })).toEqual({ x: 4, y: 3.4 });
});
