import { beforeEach, describe, expect, it } from 'vitest';
import { resetAuthStore, useAuthStore } from '../auth/authStore';
import { CLAIM_IDLE_MS, claimHeldByOther, isIdle, resetClaimsStore, useClaimsStore, type Claim } from './claimsStore';

const claim = (userId: string, lastEditAt = '2026-01-01T00:00:00.000Z'): Claim => ({ roomId: 'r', userId, name: 'Ada', since: lastEditAt, lastEditAt });
const signInAs = (id: string) => useAuthStore.setState({ status: 'signed-in', user: { id, name: 'U', email: 'u@x', role: 'editor', mustChangePassword: false } });

beforeEach(() => {
  resetAuthStore();
  resetClaimsStore();
});

describe('claimHeldByOther', () => {
  it('is null when signed out, even if a claim exists', () => {
    useClaimsStore.getState().setClaims([claim('u-other')]);
    expect(claimHeldByOther('r')).toBeNull();
  });

  it('is null for my own claim', () => {
    signInAs('u-me');
    useClaimsStore.getState().setClaims([claim('u-me')]);
    expect(claimHeldByOther('r')).toBeNull();
  });

  it("returns someone else's claim", () => {
    signInAs('u-me');
    useClaimsStore.getState().setClaims([claim('u-other')]);
    expect(claimHeldByOther('r')).toMatchObject({ userId: 'u-other', name: 'Ada' });
  });

  it('is null for a room nobody holds', () => {
    signInAs('u-me');
    expect(claimHeldByOther('r')).toBeNull();
  });
});

describe('isIdle', () => {
  it('turns true at exactly 15 minutes without an edit', () => {
    const c = claim('u');
    const start = Date.parse(c.lastEditAt);
    expect(isIdle(c, start + CLAIM_IDLE_MS - 1)).toBe(false);
    expect(isIdle(c, start + CLAIM_IDLE_MS)).toBe(true);
  });
});
