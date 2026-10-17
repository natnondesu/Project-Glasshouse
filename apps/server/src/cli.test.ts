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

it('changes a role, refusing an unknown user, the last admin and a bad role', async () => {
  const store = new MemoryIdentityStore();
  const out: string[] = [];
  await runCli(['create-admin', 'few@company.test', 'Few N.'], store, () => {});
  await store.createUser({ id: 'p', email: 'ploy@x.test', displayName: 'Ploy', role: 'viewer', source: 'oidc', oidcSubject: 's', passwordHash: null, mustChangePassword: false, nameLocked: false, active: true, createdAt: '2026-10-18T09:00:00.000Z', lastLoginAt: null });
  expect(await runCli(['set-role', 'ploy@x.test', 'editor'], store, (l) => out.push(l))).toBe(0);
  expect((await store.findUserByEmail('ploy@x.test'))?.role).toBe('editor');
  expect(await runCli(['set-role', 'nobody@x.test', 'editor'], store, (l) => out.push(l))).toBe(1);
  out.length = 0;
  expect(await runCli(['set-role', 'few@company.test', 'viewer'], store, (l) => out.push(l))).toBe(1);
  expect(out.join('\n')).toContain('last admin');
  expect((await store.findUserByEmail('few@company.test'))?.role).toBe('admin');
  expect(await runCli(['set-role', 'ploy@x.test', 'boss'], store, (l) => out.push(l))).toBe(2);
  expect(await runCli(['set-role', 'ploy@x.test'], store, (l) => out.push(l))).toBe(2);
  expect(await runCli(['set-role', 'few@company.test', 'admin'], store, (l) => out.push(l))).toBe(0);
});
