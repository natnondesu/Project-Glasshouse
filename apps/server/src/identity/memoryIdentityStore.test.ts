import { describe, expect, it } from 'vitest';
import { MemoryIdentityStore } from './memoryIdentityStore';
import { hashEmail, hashSubject } from './removed';
import { DuplicateUserError, type RemovedSignIn, type User } from './types';

export const userFixture = (over: Partial<User> = {}): User => ({
  id: 'u1', email: 'ploy@company.test', displayName: 'Ploy S.', role: 'editor', source: 'local', oidcSubject: null,
  passwordHash: null, mustChangePassword: false, nameLocked: false, active: true, createdAt: '2026-10-18T00:00:00.000Z', lastLoginAt: null, ...over,
});

describe('MemoryIdentityStore', () => {
  it('finds users by id, email (any case) and subject, and refuses duplicates', async () => {
    const s = new MemoryIdentityStore();
    await s.createUser(userFixture({ oidcSubject: 'sub-1' }));
    expect((await s.findUserByEmail('PLOY@company.test'))?.id).toBe('u1');
    expect((await s.findUserBySubject('sub-1'))?.id).toBe('u1');
    await expect(s.createUser(userFixture({ id: 'u2', email: 'Ploy@Company.test' }))).rejects.toBeInstanceOf(DuplicateUserError);
    await expect(s.createUser(userFixture({ id: 'u3', email: 'x@company.test', oidcSubject: 'sub-1' }))).rejects.toBeInstanceOf(DuplicateUserError);
  });

  it('updates users and counts active admins', async () => {
    const s = new MemoryIdentityStore();
    await s.createUser(userFixture({ role: 'admin' }));
    await s.createUser(userFixture({ id: 'u2', email: 'nok@company.test', role: 'admin', active: false }));
    expect(await s.countActiveAdmins()).toBe(1);
    expect((await s.updateUser('u1', { role: 'reviewer' }))?.role).toBe('reviewer');
    expect(await s.countActiveAdmins()).toBe(0);
    expect((await s.updateUser('u1', { nameLocked: true }))?.nameLocked).toBe(true);
    expect((await s.findUserById('u1'))?.nameLocked).toBe(true);
    expect(await s.updateUser('missing', { role: 'admin' })).toBeNull();
  });

  it('keeps sessions, touches, deletes per user, and sweeps expired ones', async () => {
    const s = new MemoryIdentityStore();
    const base = { userId: 'u1', createdAt: '2026-10-18T00:00:00.000Z', lastSeenAt: '2026-10-18T00:00:00.000Z' };
    await s.createSession({ ...base, tokenHash: 'a', expiresAt: '2026-10-25T00:00:00.000Z' });
    await s.createSession({ ...base, tokenHash: 'b', expiresAt: '2026-10-18T01:00:00.000Z' });
    await s.touchSession('a', '2026-10-18T02:00:00.000Z');
    expect((await s.findSession('a'))?.lastSeenAt).toBe('2026-10-18T02:00:00.000Z');
    expect(await s.deleteExpiredSessions('2026-10-18T03:00:00.000Z')).toBe(1);
    await s.deleteUserSessions('u1');
    expect(await s.findSession('a')).toBeNull();
  });
});

export const removalFixture = (over: Partial<RemovedSignIn> = {}): RemovedSignIn => ({ subjectHash: hashSubject('sub-1'), emailHash: hashEmail('ploy@company.test'), removedAt: '2026-10-18T09:00:00.000Z', removedBy: 'admin', ...over });

describe('MemoryIdentityStore.deleteUser', () => {
  it('removes the user and their sessions, frees the email, and reports whether anyone was there', async () => {
    const s = new MemoryIdentityStore();
    await s.createUser(userFixture({ oidcSubject: 'sub-1' }));
    await s.createSession({ tokenHash: 'a', userId: 'u1', createdAt: '2026-10-18T00:00:00.000Z', lastSeenAt: '2026-10-18T00:00:00.000Z', expiresAt: '2026-10-25T00:00:00.000Z' });
    expect(await s.deleteUser('u1', removalFixture())).toBe(true);
    expect(await s.findUserById('u1')).toBeNull();
    expect(await s.findSession('a')).toBeNull();
    expect(await s.deleteUser('u1', removalFixture())).toBe(false);
    expect(await s.findRemoval(null, hashEmail('PLOY@company.test'))).toMatchObject({ removedBy: 'admin' });
    await s.createUser(userFixture({ id: 'u2', oidcSubject: 'sub-1' }));
    expect((await s.findUserByEmail('ploy@company.test'))?.id).toBe('u2');
  });
});

describe('MemoryIdentityStore removals', () => {
  it('finds a removal by subject or by email, never by nothing, and forgets it by email', async () => {
    const s = new MemoryIdentityStore();
    await s.createUser(userFixture({ oidcSubject: 'sub-1' }));
    await s.deleteUser('u1', removalFixture());
    expect(await s.findRemoval(hashSubject('sub-1'), null)).not.toBeNull();
    expect(await s.findRemoval(null, hashEmail('ploy@company.test'))).not.toBeNull();
    expect(await s.findRemoval(null, null)).toBeNull();
    expect(await s.findRemoval(hashSubject('other'), hashEmail('other@company.test'))).toBeNull();
    expect(await s.clearRemovals(hashEmail('Ploy@Company.test'))).toBe(1);
    expect(await s.findRemoval(hashSubject('sub-1'), null)).toBeNull();
  });

  it('records no removal when nobody had that id', async () => {
    const s = new MemoryIdentityStore();
    expect(await s.deleteUser('nobody', removalFixture())).toBe(false);
    expect(await s.findRemoval(hashSubject('sub-1'), null)).toBeNull();
  });
});

describe('MemoryIdentityStore.updateUser with undefined patch values', () => {
  it('keeps fields whose patch value is undefined, like Postgres does', async () => {
    const s = new MemoryIdentityStore();
    await s.createUser(userFixture());
    const updated = await s.updateUser('u1', { displayName: undefined, role: 'admin' });
    expect(updated).toMatchObject({ displayName: 'Ploy S.', role: 'admin' });
  });
});
