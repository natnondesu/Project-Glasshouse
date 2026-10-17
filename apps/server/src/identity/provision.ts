import { randomUUID } from 'node:crypto';
import type { OidcClaims } from '../http/auth/oidc';
import { DuplicateUserError, type IdentityStore, type Role, type User } from './types';

const NAME_MAX = 80;
const ALREADY = 'An account with this email already exists in Glasshouse. Ask an admin to link it.';

/** Who an SSO sign-in is: by subject first, then a local account with the same *verified* email, else a new user. */
export async function provisionOidcUser(
  store: IdentityStore,
  claims: OidcClaims,
  { defaultRole, bootstrapAdmin, now }: { defaultRole: Role; bootstrapAdmin: string | null; now: string },
): Promise<{ user: User } | { refused: string }> {
  const displayName = (claims.name ?? claims.email ?? claims.sub).trim().slice(0, NAME_MAX) || claims.sub;
  let user = await store.findUserBySubject(claims.sub);
  if (!user && claims.email) {
    const byEmail = await store.findUserByEmail(claims.email);
    if (byEmail && byEmail.oidcSubject === null) {
      if (!claims.emailVerified) return { refused: ALREADY };
      user = await store.updateUser(byEmail.id, { oidcSubject: claims.sub });
    }
  }
  try {
    if (!user) {
      const isBootstrap = bootstrapAdmin !== null && claims.emailVerified && claims.email !== null && claims.email.toLowerCase() === bootstrapAdmin.toLowerCase();
      const created: User = {
        id: randomUUID(), email: claims.email ?? `${claims.sub}@sso.invalid`, displayName, role: isBootstrap ? 'admin' : defaultRole, source: 'oidc',
        oidcSubject: claims.sub, passwordHash: null, mustChangePassword: false, active: true, createdAt: now, lastLoginAt: now,
      };
      await store.createUser(created);
      return { user: created };
    }
    if (!user.active) return { refused: 'Your Glasshouse account is switched off. Ask an admin.' };
    const updated = await store.updateUser(user.id, { displayName, ...(claims.email && claims.emailVerified ? { email: claims.email } : {}), lastLoginAt: now });
    return updated ? { user: updated } : { refused: 'Your account could not be found. Try again.' };
  } catch (e) {
    if (e instanceof DuplicateUserError) return { refused: ALREADY };
    throw e;
  }
}
