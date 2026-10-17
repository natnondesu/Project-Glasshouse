import type { FastifyReply, FastifyRequest } from 'fastify';
import type { IdentityStore, User } from '../../identity/types';
import { hashToken, newSessionToken } from '../../identity/tokens';
import type { Authenticate } from '../devAuth';

export const SESSION_COOKIE = 'gh_session';
export const SESSION_IDLE_MS = 12 * 60 * 60 * 1000;
export const SESSION_MAX_MS = 7 * 24 * 60 * 60 * 1000;
/** Busy users would otherwise write the session row on every request. */
const TOUCH_EVERY_MS = 5 * 60 * 1000;

export interface SessionAuth {
  authenticate: Authenticate;
  startSession(reply: FastifyReply, user: User): Promise<void>;
  endSession(request: FastifyRequest, reply: FastifyReply): Promise<void>;
}

export function createSessionAuth(store: IdentityStore, { secure, now = () => new Date() }: { secure: boolean; now?: () => Date }): SessionAuth {
  const cookieOptions = { httpOnly: true, sameSite: 'lax' as const, secure, path: '/' };
  const tokenOf = (request: FastifyRequest): string | null => {
    const value = request.cookies[SESSION_COOKIE];
    return typeof value === 'string' && value.length > 0 ? value : null;
  };
  return {
    async authenticate(request) {
      const token = tokenOf(request);
      if (!token) return null;
      const tokenHash = hashToken(token);
      const session = await store.findSession(tokenHash);
      if (!session) return null;
      const t = now().getTime();
      if (t >= Date.parse(session.expiresAt) || t - Date.parse(session.lastSeenAt) > SESSION_IDLE_MS) {
        await store.deleteSession(tokenHash);
        return null;
      }
      const user = await store.findUserById(session.userId);
      if (!user || !user.active) return null;
      if (t - Date.parse(session.lastSeenAt) > TOUCH_EVERY_MS) await store.touchSession(tokenHash, new Date(t).toISOString());
      return { id: user.id, name: user.displayName, role: user.role, verified: true, mustChangePassword: user.mustChangePassword };
    },
    async startSession(reply, user) {
      const token = newSessionToken();
      const t = now();
      await store.createSession({ tokenHash: hashToken(token), userId: user.id, createdAt: t.toISOString(), lastSeenAt: t.toISOString(), expiresAt: new Date(t.getTime() + SESSION_MAX_MS).toISOString() });
      reply.setCookie(SESSION_COOKIE, token, { ...cookieOptions, maxAge: SESSION_MAX_MS / 1000 });
    },
    async endSession(request, reply) {
      const token = tokenOf(request);
      if (token) await store.deleteSession(hashToken(token));
      reply.clearCookie(SESSION_COOKIE, cookieOptions);
    },
  };
}
