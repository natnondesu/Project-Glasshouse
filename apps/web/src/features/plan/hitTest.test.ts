import { createObject } from '@glasshouse/domain';
import { expect, it } from 'vitest';
import { hitTest } from './hitTest';

it('returns the topmost object under the point', () => {
  const below = { ...createObject('furniture', { x: 1, y: 1 }, []), name: 'below' };
  const above = { ...createObject('furniture', { x: 1.5, y: 1 }, []), name: 'above' };
  expect(hitTest([below, above], [1.8, 1.2])?.name).toBe('above');
  expect(hitTest([below, above], [1.1, 1.2])?.name).toBe('below');
  expect(hitTest([below, above], [4, 4])).toBeNull();
});

it('picks the door standing in a partition, not the wall under it, whichever was drawn last', () => {
  const wall = { ...createObject('partition', { x: 2, y: 2 }, []), id: 'wall' };
  const door = { ...createObject('door', { x: 2.55, y: 2 }, []), id: 'door' };
  expect(hitTest([door, wall], [3, 2.05])?.id).toBe('door');
  expect(hitTest([wall, door], [3, 2.05])?.id).toBe('door');
  expect(hitTest([door, wall], [2.2, 2.05])?.id).toBe('wall');
});

it('lets a thin partition be grabbed a few pixels either side of its line', () => {
  const wall = { ...createObject('partition', { x: 2, y: 2 }, []), id: 'wall' };
  expect(hitTest([wall], [3, 2.15])).toBeNull();
  expect(hitTest([wall], [3, 2.15], 0.1)?.id).toBe('wall');
  expect(hitTest([wall], [3, 2.4], 0.1)).toBeNull();
  expect(hitTest([wall], [1.95, 2.05], 0.1)?.id).toBe('wall');
});

it('prefers an object under the point to a partition grabbed by its margin', () => {
  const wall = { ...createObject('partition', { x: 2, y: 2 }, []), id: 'wall' };
  const desk = { ...createObject('furniture', { x: 2.5, y: 2.12 }, []), id: 'desk' };
  expect(hitTest([wall, desk], [3, 2.15], 0.1)?.id).toBe('desk');
});
