import type { ProjectFile } from '@glasshouse/domain';
import { create } from 'zustand';
import { useAuthStore } from '../auth/authStore';

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
  roomId: string;
  roomName: string;
  holderName: string | null;
  changes: number;
  file: ProjectFile;
}

interface ClaimsState {
  byRoom: Record<string, Claim>;
  lost: ClaimLost | null;
  setClaims: (list: Claim[]) => void;
  setLost: (lost: ClaimLost | null) => void;
}

export const useClaimsStore = create<ClaimsState>()((set) => ({
  byRoom: {},
  lost: null,
  setClaims: (list) => set({ byRoom: Object.fromEntries(list.map((c) => [c.roomId, c])) }),
  setLost: (lost) => set({ lost }),
}));

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

export const resetClaimsStore = (): void => useClaimsStore.setState({ byRoom: {}, lost: null });
