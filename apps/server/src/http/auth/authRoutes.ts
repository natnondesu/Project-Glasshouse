import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { AuthConfig } from '../../config';
import { hashPassword, passwordProblem, verifyPassword } from '../../identity/passwords';
import type { IdentityStore } from '../../identity/types';
import { checkMutation } from './csrf';
import type { LoginThrottle } from './loginThrottle';
import type { OidcLogin } from './oidc';
import type { SessionAuth } from './sessionAuth';

export interface AuthRouteDeps {
  store: IdentityStore;
  sessions: SessionAuth;
  config: AuthConfig;
  oidc: OidcLogin | null;
  throttle: LoginThrottle;
  now: () => Date;
}

const WRONG = { error: { code: 'unauthorised', message: 'That email and password don’t match an account.', targets: [] } };
const loginBody = z.object({ email: z.string().min(3).max(200), password: z.string().min(1).max(500) });
const passwordBody = z.object({ current: z.string().min(1).max(500), next: z.string().max(500) });
const refuse = (reply: FastifyReply, status: number, code: string, message: string) => reply.code(status).send({ error: { code, message, targets: [] } });

export function registerAuthRoutes(app: FastifyInstance, deps: AuthRouteDeps): void {
  const { store, sessions, config, throttle, now } = deps;
  const origin = config.publicUrl.origin;

  app.get('/auth/config', async () => ({ mode: 'on', localLogin: config.localLogin, sso: deps.oidc !== null }));

  app.get('/auth/me', async (request, reply) => {
    const actor = await sessions.authenticate(request);
    if (!actor) return refuse(reply, 401, 'unauthorised', 'Sign in to use Glasshouse.');
    const user = await store.findUserById(actor.id);
    if (!user) return refuse(reply, 401, 'unauthorised', 'Sign in to use Glasshouse.');
    return { id: user.id, name: user.displayName, email: user.email, role: user.role, mustChangePassword: user.mustChangePassword };
  });

  app.post('/auth/login', async (request, reply) => {
    const csrf = checkMutation(request, origin);
    if (csrf) return refuse(reply, 403, 'csrf', csrf);
    if (!config.localLogin) return refuse(reply, 404, 'not_found', 'Sign-in with a password is switched off here.');
    const body = loginBody.safeParse(request.body);
    if (!body.success) return reply.code(401).send(WRONG);
    const key = `${request.ip}|${body.data.email.toLowerCase()}`;
    if (throttle.blocked(key)) return refuse(reply, 429, 'too_many', 'Too many tries. Wait 15 minutes and try again.');
    const user = await store.findUserByEmail(body.data.email);
    const ok = user !== null && user.active && user.source === 'local' && user.passwordHash !== null && (await verifyPassword(body.data.password, user.passwordHash));
    if (!ok || !user) {
      throttle.fail(key);
      return reply.code(401).send(WRONG);
    }
    throttle.clear(key);
    await store.updateUser(user.id, { lastLoginAt: now().toISOString() });
    await sessions.startSession(reply, user);
    return { mustChangePassword: user.mustChangePassword };
  });

  app.post('/auth/password', async (request, reply) => {
    const csrf = checkMutation(request, origin);
    if (csrf) return refuse(reply, 403, 'csrf', csrf);
    const actor = await sessions.authenticate(request);
    if (!actor) return refuse(reply, 401, 'unauthorised', 'Sign in again to change your password.');
    const user = await store.findUserById(actor.id);
    if (!user || user.source !== 'local' || !user.passwordHash) return refuse(reply, 400, 'invalid_value', 'This account signs in through the company account; change the password there.');
    const body = passwordBody.safeParse(request.body);
    if (!body.success) return refuse(reply, 400, 'invalid_value', 'Fill in your current and new password.');
    if (!(await verifyPassword(body.data.current, user.passwordHash))) return refuse(reply, 400, 'invalid_value', 'Your current password is not right.');
    const problem = passwordProblem(body.data.next);
    if (problem) return refuse(reply, 400, 'invalid_value', problem);
    await store.updateUser(user.id, { passwordHash: await hashPassword(body.data.next), mustChangePassword: false });
    // Every other session (and this one) ends; this browser gets a fresh one.
    await store.deleteUserSessions(user.id);
    await sessions.startSession(reply, { ...user, mustChangePassword: false });
    return reply.code(204).send();
  });

  app.post('/auth/logout', async (request, reply) => {
    const csrf = checkMutation(request, origin);
    if (csrf) return refuse(reply, 403, 'csrf', csrf);
    await sessions.endSession(request, reply);
    return reply.code(204).send();
  });
}
