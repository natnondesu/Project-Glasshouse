import type { ProjectFile } from '@glasshouse/domain';
import { create } from 'zustand';
import { useAuthStore } from '../auth/authStore';
import { createUnloadGuard } from '../sync/unloadGuard';

/** Same as the server's CLAIM_IDLE_MS: after this long without an edit anyone may take over. */
export const CLAIM_IDLE_MS = 15 * 60 * 1000;

export interface Claim {
  roomId: string;
  userId: string;
  name: string;
  since: string;
  lastEditAt: string;
}

export interface ClaimLost {
  /** Whose work this is. Only that person sees it; it stays in memory when someone else signs in on this tab. */
  userId: string | null;
  roomId: string;
  roomName: string;
  holderName: string | null;
  changes: number;
  file: ProjectFile;
}

interface ClaimsState {
  byRoom: Record<string, Claim>;
  /** Versions waiting to be kept or discarded; the dialog shows the signed-in person's first. */
  lost: ClaimLost[];
  setClaims: (list: Claim[]) => void;
  pushLost: (lost: ClaimLost) => void;
  dropLost: (lost: ClaimLost) => void;
}

export const useClaimsStore = create<ClaimsState>()((set) => ({
  byRoom: {},
  lost: [],
  setClaims: (list) => set({ byRoom: Object.fromEntries(list.map((c) => [c.roomId, c])) }),
  pushLost: (lost) => set((s) => ({ lost: [...s.lost, lost] })),
  dropLost: (lost) => set((s) => ({ lost: s.lost.filter((l) => l !== lost) })),
}));

// A copy nobody has kept yet is the only one: leaving the page would lose it.
const lostGuard = createUnloadGuard(window);
useClaimsStore.subscribe((s) => lostGuard.set(s.lost.length > 0));

const otherHolder = (claim: Claim | undefined, me: string | undefined): Claim | null => (claim && me && claim.userId !== me ? claim : null);

/** Signed-in only: local and dev mode have no claims, so nothing is ever held by someone else. */
export const claimHeldByOther = (roomId: string): Claim | null => otherHolder(useClaimsStore.getState().byRoom[roomId], useAuthStore.getState().user?.id);

export function useClaimHeldByOther(roomId: string): Claim | null {
  const claim = useClaimsStore((s) => s.byRoom[roomId]);
  const me = useAuthStore((s) => s.user?.id);
  return otherHolder(claim, me);
}

export function useMyClaim(roomId: string): Claim | null {
  const claim = useClaimsStore((s) => s.byRoom[roomId]);
  const me = useAuthStore((s) => s.user?.id);
  return claim && me && claim.userId === me ? claim : null;
}

export const isIdle = (claim: Claim, now: number): boolean => now - Date.parse(claim.lastEditAt) >= CLAIM_IDLE_MS;

/** When the sync stops: who holds what is unknown, but a lost version is still the person's to keep. */
export const resetClaimsStore = (): void => useClaimsStore.setState({ byRoom: {} });

export const clearClaimsStore = (): void => useClaimsStore.setState({ byRoom: {}, lost: [] });
