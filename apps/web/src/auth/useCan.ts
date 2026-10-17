import type { AuthUser, Role } from './authApi';
import { useAuthStore } from './authStore';

const RANK: Record<Role, number> = { viewer: 0, editor: 1, reviewer: 2, admin: 3 };

export interface Can {
  me: AuthUser | null;
  edit: boolean;
  review: boolean;
  admin: boolean;
  verifiedNames: boolean;
}

const EVERYTHING: Can = { me: null, edit: true, review: true, admin: true, verifiedNames: false };

/** What the signed-in person may do. Local and dev mode have nobody to sign in: everything is allowed, names are typed. */
export function useCan(): Can {
  const status = useAuthStore((s) => s.status);
  const me = useAuthStore((s) => s.user);
  if (status !== 'signed-in' || !me) return EVERYTHING;
  const rank = RANK[me.role];
  return { me, edit: rank >= RANK.editor, review: rank >= RANK.reviewer, admin: rank >= RANK.admin, verifiedNames: true };
}
