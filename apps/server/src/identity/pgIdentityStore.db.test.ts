import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { PgIdentityStore } from './pgIdentityStore';
import { DuplicateUserError, type User } from './types';

let container: StartedPostgreSqlContainer;
beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:18-alpine').start();
});
afterAll(async () => {
  await container?.stop();
});

const user = (over: Partial<User> = {}): User => ({
  id: 'u1', email: 'ploy@company.test', displayName: 'Ploy S.', role: 'admin', source: 'oidc', oidcSubject: 'sub-1',
  passwordHash: null, mustChangePassword: false, nameLocked: false, active: true, createdAt: '2026-10-18T00:00:00.000Z', lastLoginAt: null, ...over,
});

it('stores users and sessions in Postgres with the same rules as memory', async () => {
  const s = await PgIdentityStore.connect(container.getConnectionUri());
  await s.createUser(user());
  expect((await s.findUserByEmail('PLOY@COMPANY.TEST'))?.oidcSubject).toBe('sub-1');
  await expect(s.createUser(user({ id: 'u2', email: 'Ploy@company.test', oidcSubject: null }))).rejects.toBeInstanceOf(DuplicateUserError);
  expect(await s.countActiveAdmins()).toBe(1);
  expect((await s.updateUser('u1', { role: 'viewer', lastLoginAt: '2026-10-18T05:00:00.000Z' }))).toMatchObject({ role: 'viewer', lastLoginAt: '2026-10-18T05:00:00.000Z' });
  expect(await s.updateUser('u1', { displayName: 'Ploy Sriwan', nameLocked: true })).toMatchObject({ displayName: 'Ploy Sriwan', nameLocked: true });
  expect((await s.findUserById('u1'))?.nameLocked).toBe(true);
  await s.createSession({ tokenHash: 'h', userId: 'u1', createdAt: '2026-10-18T00:00:00.000Z', lastSeenAt: '2026-10-18T00:00:00.000Z', expiresAt: '2026-10-19T00:00:00.000Z' });
  expect((await s.findSession('h'))?.userId).toBe('u1');
  expect(await s.deleteExpiredSessions('2026-10-20T00:00:00.000Z')).toBe(1);
  expect((await s.listUsers()).map((u) => u.id)).toEqual(['u1']);
  await s.close();
});

it('deletes a user, cascades their sessions and frees the email and sign-in for a fresh account', async () => {
  const s = await PgIdentityStore.connect(container.getConnectionUri());
  await s.createUser(user({ id: 'gone', email: 'gone@company.test', oidcSubject: 'sub-gone' }));
  await s.createSession({ tokenHash: 'gone-h', userId: 'gone', createdAt: '2026-10-18T00:00:00.000Z', lastSeenAt: '2026-10-18T00:00:00.000Z', expiresAt: '2026-10-19T00:00:00.000Z' });
  expect(await s.deleteUser('gone')).toBe(true);
  expect(await s.findUserById('gone')).toBeNull();
  expect(await s.findSession('gone-h')).toBeNull();
  expect(await s.deleteUser('gone')).toBe(false);
  await s.createUser(user({ id: 'back', email: 'Gone@company.test', oidcSubject: 'sub-gone' }));
  expect((await s.findUserByEmail('gone@company.test'))?.id).toBe('back');
  await s.close();
});
