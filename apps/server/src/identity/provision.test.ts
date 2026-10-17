import { describe, expect, it } from 'vitest';
import { MemoryIdentityStore } from './memoryIdentityStore';
import { provisionOidcUser } from './provision';

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
    await store.createUser({ id: 'local-1', email: 'ploy@company.test', displayName: 'Ploy', role: 'editor', source: 'local', oidcSubject: null, passwordHash: 'x', mustChangePassword: false, active: true, createdAt: NOW, lastLoginAt: null });
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
});
