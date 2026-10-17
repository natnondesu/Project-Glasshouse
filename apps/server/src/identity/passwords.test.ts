import { expect, it } from 'vitest';
import { hashPassword, passwordProblem, temporaryPassword, verifyPassword } from './passwords';

it('hashes with a fresh salt and verifies only the right password', async () => {
  const a = await hashPassword('correct horse battery');
  const b = await hashPassword('correct horse battery');
  expect(a).not.toBe(b);
  expect(a.startsWith('scrypt$32768$8$1$')).toBe(true);
  expect(await verifyPassword('correct horse battery', a)).toBe(true);
  expect(await verifyPassword('correct horse batterz', a)).toBe(false);
  expect(await verifyPassword('anything', 'not-a-hash')).toBe(false);
});

it('explains passwords that are too short or too long', () => {
  expect(passwordProblem('short')).toMatch(/at least 12/);
  expect(passwordProblem('x'.repeat(201))).toMatch(/at most 200/);
  expect(passwordProblem('long enough password')).toBeNull();
});

it('makes temporary passwords that pass the rules and differ', () => {
  const a = temporaryPassword();
  expect(passwordProblem(a)).toBeNull();
  expect(temporaryPassword()).not.toBe(a);
});

it('rejects stored hashes with an empty key or salt instead of accepting any password', async () => {
  const good = await hashPassword('correct horse battery');
  const [, , , , salt] = good.split('$');
  expect(await verifyPassword('anything at all', `scrypt$32768$8$1$${salt}$`)).toBe(false);
  expect(await verifyPassword('anything at all', `scrypt$32768$8$1$$${good.split('$')[5]}`)).toBe(false);
});

it('rejects stored hashes with cost parameters other than the current ones', async () => {
  const good = await hashPassword('correct horse battery');
  const [, , , , salt, key] = good.split('$');
  expect(await verifyPassword('correct horse battery', `scrypt$1048576$8$1$${salt}$${key}`)).toBe(false);
  expect(await verifyPassword('correct horse battery', `scrypt$32768$64$1$${salt}$${key}`)).toBe(false);
  expect(await verifyPassword('correct horse battery', `scrypt$abc$8$1$${salt}$${key}`)).toBe(false);
  expect(await verifyPassword('correct horse battery', `scrypt$0$8$1$${salt}$${key}`)).toBe(false);
});
