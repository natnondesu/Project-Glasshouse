import { expect, it } from 'vitest';
import { MemoryIdentityStore } from './memoryIdentityStore';
import { verifyPassword } from './passwords';
import { parseSeedUsers, seedUsers } from './seedUsers';

it('parses and creates local users with hashed passwords', async () => {
  const users = parseSeedUsers('a@x.test:password-111111:admin:Ann; r@x.test:password-222222:reviewer:Rob');
  expect(users.map((u) => u.role)).toEqual(['admin', 'reviewer']);
  const store = new MemoryIdentityStore();
  await seedUsers(store, users, '2026-10-18T00:00:00.000Z');
  const ann = await store.findUserByEmail('a@x.test');
  expect(ann).toMatchObject({ source: 'local', role: 'admin', displayName: 'Ann', mustChangePassword: false });
  expect(await verifyPassword('password-111111', ann!.passwordHash!)).toBe(true);
  expect(() => parseSeedUsers('bad-entry')).toThrow(/email:password:role:Name/);
  expect(() => parseSeedUsers('a@x.test:short:admin:Ann')).toThrow(/at least 8/);
});
