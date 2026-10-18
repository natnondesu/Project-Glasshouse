import { randomUUID } from 'node:crypto';
import type { OidcClaims, SigninErrorCode } from '../http/auth/oidc';
import { hashEmail, hashSubject } from './removed';
import { DuplicateUserError, type IdentityStore, type Role, type User } from './types';

const NAME_MAX = 80;

/** Who an SSO sign-in is: by subject first, then a local account with the same *verified* email, else a new user. */
export async function provisionOidcUser(
  store: IdentityStore,
  claims: OidcClaims,
  { defaultRole, bootstrapAdmin, now }: { defaultRole: Role; bootstrapAdmin: string | null; now: string },
): Promise<{ user: User } | { refused: SigninErrorCode }> {
  const displayName = (claims.name ?? claims.email ?? claims.sub).trim().slice(0, NAME_MAX) || claims.sub;
  let user = await store.findUserBySubject(claims.sub);
  if (!user && claims.email) {
    const byEmail = await store.findUserByEmail(claims.email);
    if (byEmail && byEmail.oidcSubject === null) {
      if (!claims.emailVerified) return { refused: 'exists' };
      // An account an admin just added still holds an unused temporary password. The company sign-in replaces it, so they are not asked to change a password they never saw.
      user = await store.updateUser(byEmail.id, { oidcSubject: claims.sub, ...(byEmail.mustChangePassword ? { mustChangePassword: false, passwordHash: null } : {}) });
    }
  }
  try {
    if (!user) {
      // An admin deleted this account: the sign-in stays blocked until an admin adds the person again (which links above).
      // An unverified email proves nothing, so only the subject can match then.
      const removed = await store.findRemoval(hashSubject(claims.sub), claims.email && claims.emailVerified ? hashEmail(claims.email) : null);
      if (removed) return { refused: 'removed' };
      const isBootstrap = bootstrapAdmin !== null && claims.emailVerified && claims.email !== null && claims.email.toLowerCase() === bootstrapAdmin.toLowerCase();
      const created: User = {
        id: randomUUID(), email: claims.email ?? `${claims.sub}@sso.invalid`, displayName, role: isBootstrap ? 'admin' : defaultRole, source: 'oidc',
        oidcSubject: claims.sub, passwordHash: null, mustChangePassword: false, nameLocked: false, active: true, createdAt: now, lastLoginAt: now,
      };
      await store.createUser(created);
      return { user: created };
    }
    if (!user.active) return { refused: 'switched_off' };
    const updated = await store.updateUser(user.id, { ...(user.nameLocked ? {} : { displayName }), ...(claims.email && claims.emailVerified ? { email: claims.email } : {}), lastLoginAt: now });
    return updated ? { user: updated } : { refused: 'generic' };
  } catch (e) {
    if (e instanceof DuplicateUserError) return { refused: 'exists' };
    throw e;
  }
}
