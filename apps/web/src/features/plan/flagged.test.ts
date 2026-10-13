import type { Issue } from '@glasshouse/domain';
import { expect, it } from 'vitest';
import { flaggedObjectIds } from './flagged';

const issue = (code: Issue['code'], severity: Issue['severity'], targets: string[]): Issue => ({ key: code + targets.join(), code, severity, message: '', hint: '', targets });

it('flags the obstacle, not the rack whose clearance it blocks', () => {
  expect([...flaggedObjectIds([issue('clearance_obstructed', 'block', ['ex', 'rack'])])]).toEqual(['ex']);
});

it('flags both objects in an overlap and ignores warnings', () => {
  const ids = flaggedObjectIds([issue('object_overlap', 'block', ['a', 'b']), issue('clearance_door', 'warn', ['d', 'rack'])]);
  expect([...ids].sort()).toEqual(['a', 'b']);
});

it('flags the node with unknown demand, not its chassis', () => {
  expect([...flaggedObjectIds([issue('demand_unknown', 'block', ['node', 'chassis'])])]).toEqual(['node']);
});

it('flags the too-deep device, not its rack', () => {
  expect([...flaggedObjectIds([issue('device_too_deep', 'block', ['dev', 'rack'])])]).toEqual(['dev']);
});
