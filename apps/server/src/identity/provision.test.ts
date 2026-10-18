import { describe, expect, it } from 'vitest';
import { MemoryIdentityStore } from './memoryIdentityStore';
import { hashEmail, hashSubject } from './removed';
import { provisionOidcUser } from './provision';
import type { User } from './types';

const NOW = '2026-10-18T09:00:00.000Z';
const opts = { defaultRole: 'viewer' as const, bootstrapAdmin: 'few@company.test', now: NOW };
const claims = (over = {}) => ({ sub: 'sub-ploy', email: 'ploy@company.test', emailVerified: true, name: 'Ploy S.', ...over });

describe('provisionOidcUser', () => {
  it('creates a new SSO user with the default role, and the bootstrap admin as admin', async () => {
    const store = new MemoryIdentityStore();
    const a = await provisionOidcUser(store, claims(), opts);
    expect('user' in a && a.user).toMatchObject({ role: 'viewer', source: 'oidc', oidcSubject: 'sub-ploy', displayName: 'Ploy S.' });
    const b = await provisionOidcUser(store, claims({ sub: 'sub-few', email: 'FEW@company.test', name: 'Few' }), opts);
    expect('user' in b && b.user.role).toBe('admin');
  });

  it('finds the same user again by subject, keeps the role and refreshes name and email', async () => {
    const store = new MemoryIdentityStore();
    const first = await provisionOidcUser(store, claims(), opts);
    if (!('user' in first)) throw new Error('refused');
    await store.updateUser(first.user.id, { role: 'reviewer' });
    const again = await provisionOidcUser(store, claims({ name: 'Ploy Suk', email: 'ploy.s@company.test' }), opts);
    expect('user' in again && again.user).toMatchObject({ id: first.user.id, role: 'reviewer', displayName: 'Ploy Suk', email: 'ploy.s@company.test' });
  });

  it('links an existing local account by verified email, never through an unverified email', async () => {
    const store = new MemoryIdentityStore();
    await store.createUser({ id: 'local-1', email: 'ploy@company.test', displayName: 'Ploy', role: 'editor', source: 'local', oidcSubject: null, passwordHash: 'x', mustChangePassword: false, nameLocked: false, active: true, createdAt: NOW, lastLoginAt: null });
    const unverified = await provisionOidcUser(store, claims({ emailVerified: false }), opts);
    expect(unverified).toEqual({ refused: 'exists' });
    const linked = await provisionOidcUser(store, claims(), opts);
    expect('user' in linked && linked.user).toMatchObject({ id: 'local-1', role: 'editor', oidcSubject: 'sub-ploy' });
  });

  it('provisions a user without an email by subject, and refuses a switched-off one', async () => {
    const store = new MemoryIdentityStore();
    const noEmail = await provisionOidcUser(store, claims({ email: null, sub: 'sub-x', name: null }), opts);
    expect('user' in noEmail && noEmail.user).toMatchObject({ oidcSubject: 'sub-x', displayName: 'sub-x' });
    if ('user' in noEmail) await store.updateUser(noEmail.user.id, { active: false });
    expect(await provisionOidcUser(store, claims({ email: null, sub: 'sub-x' }), opts)).toEqual({ refused: 'switched_off' });
  });
  it('keeps a name an admin set; a company sign-in no longer overwrites it', async () => {
    const store = new MemoryIdentityStore();
    const first = await provisionOidcUser(store, claims({ name: 'Ploy' }), opts);
    if (!('user' in first)) throw new Error('refused');
    await store.updateUser(first.user.id, { displayName: 'Ploy Sriwan', nameLocked: true });
    const again = await provisionOidcUser(store, claims({ name: 'Ploy' }), opts);
    expect(again).toMatchObject({ user: { displayName: 'Ploy Sriwan', nameLocked: true } });
  });

  it('still follows the company name while no admin has set one', async () => {
    const store = new MemoryIdentityStore();
    const first = await provisionOidcUser(store, claims({ name: 'Ploy' }), opts);
    expect(first).toMatchObject({ user: { nameLocked: false } });
    const again = await provisionOidcUser(store, claims({ name: 'Ploy S.' }), opts);
    expect(again).toMatchObject({ user: { displayName: 'Ploy S.', nameLocked: false } });
  });
});

describe('a deleted company account stays blocked', () => {
  const removal = { subjectHash: hashSubject('sub-ploy'), emailHash: hashEmail('ploy@company.test'), removedAt: NOW, removedBy: 'admin' };
  const deleted = async (): Promise<MemoryIdentityStore> => {
    const store = new MemoryIdentityStore();
    const first = await provisionOidcUser(store, claims(), opts);
    if (!('user' in first)) throw new Error('refused');
    await store.deleteUser(first.user.id, removal);
    return store;
  };

  it('refuses the same sign-in as removed, rather than creating a default-role account', async () => {
    const store = await deleted();
    expect(await provisionOidcUser(store, claims(), opts)).toEqual({ refused: 'removed' });
    expect(await store.listUsers()).toEqual([]);
  });

  it('refuses by subject even when the email changed, and by verified email even when the subject changed', async () => {
    const store = await deleted();
    expect(await provisionOidcUser(store, claims({ email: 'new@company.test' }), opts)).toEqual({ refused: 'removed' });
    expect(await provisionOidcUser(store, claims({ sub: 'sub-new', email: 'PLOY@company.test' }), opts)).toEqual({ refused: 'removed' });
  });

  it('does not let an unverified email match a removal; only the subject can', async () => {
    const store = await deleted();
    const other = await provisionOidcUser(store, claims({ sub: 'sub-new', emailVerified: false }), opts);
    expect('user' in other && other.user).toMatchObject({ oidcSubject: 'sub-new', role: 'viewer' });
  });

  it('still refuses the bootstrap admin an admin deleted on purpose', async () => {
    const store = new MemoryIdentityStore();
    await store.createUser({ id: 'few', email: 'few@company.test', displayName: 'Few', role: 'admin', source: 'oidc', oidcSubject: 'sub-few', passwordHash: null, mustChangePassword: false, nameLocked: false, active: false, createdAt: NOW, lastLoginAt: null });
    await store.deleteUser('few', { subjectHash: hashSubject('sub-few'), emailHash: hashEmail('few@company.test'), removedAt: NOW, removedBy: 'other' });
    expect(await provisionOidcUser(store, claims({ sub: 'sub-few', email: 'few@company.test' }), opts)).toEqual({ refused: 'removed' });
  });

  it('lets the person back in through the account an admin adds, with the role the admin chose', async () => {
    const store = await deleted();
    expect(await provisionOidcUser(store, claims(), opts)).toEqual({ refused: 'removed' });
    // The admin-made account still has its unused temporary password; the company sign-in replaces it.
    const readmitted: User = { id: 'new-id', email: 'ploy@company.test', displayName: 'Ploy', role: 'reviewer', source: 'local', oidcSubject: null, passwordHash: 'x', mustChangePassword: true, nameLocked: false, active: true, createdAt: NOW, lastLoginAt: null };
    await store.createUser(readmitted);
    await store.clearRemovals(hashEmail(readmitted.email));
    const back = await provisionOidcUser(store, claims(), opts);
    expect('user' in back && back.user).toMatchObject({ id: 'new-id', role: 'reviewer', oidcSubject: 'sub-ploy' });
    expect(back).toMatchObject({ user: { mustChangePassword: false, passwordHash: null } });
    // And signs in by subject from then on.
    const again = await provisionOidcUser(store, claims(), opts);
    expect('user' in again && again.user.id).toBe('new-id');
  });

  it('does not touch people who were never removed', async () => {
    const store = new MemoryIdentityStore();
    await store.createUser({ id: 'x', email: 'x@company.test', displayName: 'X', role: 'viewer', source: 'local', oidcSubject: null, passwordHash: 'x', mustChangePassword: false, nameLocked: false, active: false, createdAt: NOW, lastLoginAt: null });
    await store.deleteUser('x', { subjectHash: hashSubject('sub-x'), emailHash: hashEmail('x@company.test'), removedAt: NOW, removedBy: 'admin' });
    const fresh = await provisionOidcUser(store, claims(), opts);
    expect('user' in fresh && fresh.user.role).toBe('viewer');
  });
});
