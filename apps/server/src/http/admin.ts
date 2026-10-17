import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { hashPassword, temporaryPassword } from '../identity/passwords';
import { DuplicateUserError, ROLES, type IdentityStore, type User } from '../identity/types';

const toAdminUser = ({ passwordHash: _hash, oidcSubject: _sub, ...rest }: User) => rest;
const createBody = z.object({ email: z.string().email().max(200), displayName: z.string().trim().min(1).max(80), role: z.enum(ROLES) });
const patchBody = z.object({ role: z.enum(ROLES).optional(), active: z.boolean().optional(), displayName: z.string().trim().min(1).max(80).optional() });
const refuse = (reply: FastifyReply, status: number, code: string, message: string) => reply.code(status).send({ error: { code, message, targets: [] } });

export function registerAdmin(api: FastifyInstance, { store, localLogin, now }: { store: IdentityStore; localLogin: boolean; now: () => Date }): void {
  api.register(async (admin) => {
    admin.addHook('preHandler', async (request, reply) => {
      if (request.actor?.role !== 'admin') return refuse(reply, 403, 'forbidden', 'Only admins can manage users.');
    });

    admin.get('/api/admin/users', async () => (await store.listUsers()).map(toAdminUser));

    admin.post('/api/admin/users', async (request, reply) => {
      if (!localLogin) return refuse(reply, 400, 'invalid_value', 'Sign-in with a password is switched off; people join through the company account.');
      const body = createBody.safeParse(request.body);
      if (!body.success) return refuse(reply, 400, 'invalid_value', 'Give an email, a name and a role.');
      const temp = temporaryPassword();
      const user: User = {
        id: randomUUID(), email: body.data.email, displayName: body.data.displayName, role: body.data.role, source: 'local', oidcSubject: null,
        passwordHash: await hashPassword(temp), mustChangePassword: true, active: true, createdAt: now().toISOString(), lastLoginAt: null,
      };
      try {
        await store.createUser(user);
      } catch (e) {
        if (e instanceof DuplicateUserError) return refuse(reply, 409, 'invalid_value', 'Someone with this email already has an account.');
        throw e;
      }
      return reply.code(201).send({ user: toAdminUser(user), temporaryPassword: temp });
    });

    admin.patch('/api/admin/users/:id', async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = patchBody.safeParse(request.body);
      if (!body.success) return refuse(reply, 400, 'invalid_value', 'Nothing to change.');
      const target = await store.findUserById(id);
      if (!target) return refuse(reply, 404, 'not_found', 'That user no longer exists.');
      const losesAdmin = target.role === 'admin' && target.active && ((body.data.role !== undefined && body.data.role !== 'admin') || body.data.active === false);
      if (id === request.actor!.id && (losesAdmin || body.data.active === false)) return refuse(reply, 409, 'invalid_value', 'You can’t remove your own admin access or switch yourself off. Ask another admin.');
      if (losesAdmin && (await store.countActiveAdmins()) <= 1) return refuse(reply, 409, 'invalid_value', 'This is the last admin. Make someone else an admin first.');
      const updated = await store.updateUser(id, body.data);
      if (body.data.active === false) await store.deleteUserSessions(id);
      return updated ? toAdminUser(updated) : refuse(reply, 404, 'not_found', 'That user no longer exists.');
    });

    admin.post('/api/admin/users/:id/reset-password', async (request, reply) => {
      const { id } = request.params as { id: string };
      const target = await store.findUserById(id);
      if (!target) return refuse(reply, 404, 'not_found', 'That user no longer exists.');
      if (target.source !== 'local') return refuse(reply, 400, 'invalid_value', 'This person signs in with the company account; reset it there.');
      const temp = temporaryPassword();
      await store.updateUser(id, { passwordHash: await hashPassword(temp), mustChangePassword: true });
      await store.deleteUserSessions(id);
      return { temporaryPassword: temp };
    });
  });
}
