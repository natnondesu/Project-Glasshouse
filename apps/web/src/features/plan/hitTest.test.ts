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
