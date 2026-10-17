import { expect, it } from 'vitest';
import { hashToken, newSessionToken } from './tokens';

it('makes long random tokens and stores only their hash', () => {
  const t = newSessionToken();
  expect(t.length).toBeGreaterThanOrEqual(43);
  expect(newSessionToken()).not.toBe(t);
  expect(hashToken(t)).toMatch(/^[0-9a-f]{64}$/);
  expect(hashToken(t)).toBe(hashToken(t));
});
