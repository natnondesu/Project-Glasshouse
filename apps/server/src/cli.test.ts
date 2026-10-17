import { expect, it } from 'vitest';
import { runCli } from './cli';
import { MemoryIdentityStore } from './identity/memoryIdentityStore';
import { verifyPassword } from './identity/passwords';

it('creates the first admin and resets a password, printing the one-time password', async () => {
  const store = new MemoryIdentityStore();
  const out: string[] = [];
  expect(await runCli(['create-admin', 'few@company.test', 'Few N.'], store, (l) => out.push(l))).toBe(0);
  const temp = out.join('\n').match(/Temporary password: (\S+)/)![1]!;
  const few = await store.findUserByEmail('few@company.test');
  expect(few).toMatchObject({ role: 'admin', source: 'local', mustChangePassword: true });
  expect(await verifyPassword(temp, few!.passwordHash!)).toBe(true);
  expect(await runCli(['reset-password', 'few@company.test'], store, (l) => out.push(l))).toBe(0);
  expect(await runCli(['reset-password', 'nobody@company.test'], store, (l) => out.push(l))).toBe(1);
  expect(await runCli(['bogus'], store, (l) => out.push(l))).toBe(2);
  expect(await runCli(['create-admin', 'blank@company.test', '  '], store, (l) => out.push(l))).toBe(2);
  expect(await runCli(['create-admin', 'blank@company.test', ''], store, (l) => out.push(l))).toBe(2);
  expect(await store.findUserByEmail('blank@company.test')).toBeNull();
});
