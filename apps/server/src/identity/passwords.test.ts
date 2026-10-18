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
  expect(passwordProblem('short')).toMatch(/at least 8/);
  expect(passwordProblem('x'.repeat(201))).toMatch(/at most 200/);
  expect(passwordProblem('long enough password')).toBeNull();
});

it('refuses 7 characters and accepts 8', () => {
  expect(passwordProblem('Tr0ub4d')).toBe('Use at least 8 characters.');
  expect(passwordProblem('Tr0ub4d&')).toBeNull();
});

it('refuses common passwords whatever the case or padding', () => {
  const common = 'That password is too common. Choose something harder to guess.';
  expect(passwordProblem('password')).toBe(common);
  expect(passwordProblem('  PassWord1 ')).toBe(common);
  expect(passwordProblem('12345678')).toBe(common);
  expect(passwordProblem('Glasshouse')).toBe(common);
});

it('refuses the email, its local part, or the name as the password', () => {
  const own = "Don't use your email or name as your password.";
  const context = { email: 'Ada.Lovelace@company.test', name: 'Ada Lovelace' };
  expect(passwordProblem('ada.lovelace@company.test', context)).toBe(own);
  expect(passwordProblem('ADA.LOVELACE', context)).toBe(own);
  expect(passwordProblem(' ada lovelace ', context)).toBe(own);
  expect(passwordProblem('ada.lovelace', {})).toBeNull();
  expect(passwordProblem('ada.lovelace1', context)).toBeNull();
});

it('refuses one character repeated', () => {
  expect(passwordProblem('aaaaaaaa')).toBe('That password is too common. Choose something harder to guess.');
  expect(passwordProblem('aaaaaaab')).toBeNull();
});

it('refuses a password that is only spaces', () => {
  expect(passwordProblem('        ')).toBe('That password is too common. Choose something harder to guess.');
  expect(passwordProblem(' '.repeat(40))).toBe('That password is too common. Choose something harder to guess.');
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
