import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetAuthStore, useAuthStore } from '../auth/authStore';
import { CLAIM_IDLE_MS, claimHeldByOther, clearClaimsStore, isIdle, resetClaimsStore, useClaimsStore, type Claim, type ClaimLost } from './claimsStore';

const claim = (userId: string, lastEditAt = '2026-01-01T00:00:00.000Z'): Claim => ({ roomId: 'r', userId, name: 'Ada', since: lastEditAt, lastEditAt });
const signInAs = (id: string) => useAuthStore.setState({ status: 'signed-in', user: { id, name: 'U', email: 'u@x', role: 'editor', mustChangePassword: false } });

beforeEach(() => {
  resetAuthStore();
  clearClaimsStore();
});

const lostFor = (roomId: string): ClaimLost => ({ userId: 'u', roomId, roomName: roomId, holderName: 'Ada', changes: 1, file: {} as ClaimLost['file'] });

describe('lost queue', () => {
  afterEach(() => vi.restoreAllMocks());

  it('keeps losses in order and drops the one that was dealt with', () => {
    const s = useClaimsStore.getState();
    s.pushLost(lostFor('a'));
    s.pushLost(lostFor('b'));
    expect(useClaimsStore.getState().lost.map((l) => l.roomId)).toEqual(['a', 'b']);
    useClaimsStore.getState().dropLost(useClaimsStore.getState().lost[0]!);
    expect(useClaimsStore.getState().lost.map((l) => l.roomId)).toEqual(['b']);
  });

  it('survives resetClaimsStore, which only forgets who holds what', () => {
    useClaimsStore.getState().setClaims([claim('u')]);
    useClaimsStore.getState().pushLost(lostFor('a'));
    resetClaimsStore();
    expect(useClaimsStore.getState().byRoom).toEqual({});
    expect(useClaimsStore.getState().lost).toHaveLength(1);
  });

  it('asks the browser to confirm leaving while a loss is waiting, and stops when the queue empties', () => {
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    useClaimsStore.getState().pushLost(lostFor('a'));
    expect(add).toHaveBeenCalledWith('beforeunload', expect.any(Function));
    useClaimsStore.getState().pushLost(lostFor('b'));
    useClaimsStore.getState().dropLost(useClaimsStore.getState().lost[0]!);
    expect(remove).not.toHaveBeenCalledWith('beforeunload', expect.any(Function));
    useClaimsStore.getState().dropLost(useClaimsStore.getState().lost[0]!);
    expect(remove).toHaveBeenCalledWith('beforeunload', expect.any(Function));
  });
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
