import { expect, it } from 'vitest';
import { LoginThrottle, MAX_FAILURES, WINDOW_MS } from './loginThrottle';

it('blocks a key after repeated failures until the window passes', () => {
  let t = 0;
  const throttle = new LoginThrottle(() => t);
  for (let i = 0; i < MAX_FAILURES; i += 1) throttle.fail('ip|ploy');
  expect(throttle.blocked('ip|ploy')).toBe(true);
  expect(throttle.blocked('ip|nok')).toBe(false);
  t = WINDOW_MS + 1;
  expect(throttle.blocked('ip|ploy')).toBe(false);
  throttle.fail('ip|ploy');
  throttle.clear('ip|ploy');
  expect(throttle.blocked('ip|ploy')).toBe(false);
});
