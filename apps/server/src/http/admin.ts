import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { exportBackup } from '@glasshouse/domain';
import { hashPassword, temporaryPassword } from '../identity/passwords';
import { DuplicateUserError, ROLES, type IdentityStore, type User } from '../identity/types';
import type { ClaimRegistry } from '../claims';
import type { WorkspaceService } from '../workspaceService';

const toAdminUser = ({ passwordHash: _hash, oidcSubject: _sub, ...rest }: User) => rest;
const createBody = z.object({ email: z.string().email().max(200), displayName: z.string().trim().min(1).max(80), role: z.enum(ROLES) });
const patchBody = z.object({ role: z.enum(ROLES).optional(), active: z.boolean().optional(), displayName: z.string().trim().min(1).max(80).optional() });
const refuse = (reply: FastifyReply, status: number, code: string, message: string) => reply.code(status).send({ error: { code, message, targets: [] } });

/** The server's own calendar day (TZ in the container is Asia/Bangkok), which is the day the admin sees on the wall. */
const localDay = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function registerAdmin(api: FastifyInstance, { store, service, claims, localLogin, now }: { store: IdentityStore; service: WorkspaceService; claims?: ClaimRegistry; localLogin: boolean; now: () => Date }): void {
  // One instance by design (see the P1 design doc), so an in-process queue is enough to make
  // "count the admins, then change one" atomic.
  let queue: Promise<unknown> = Promise.resolve();
  const serialized = <T>(job: () => Promise<T>): Promise<T> => {
    const run = queue.then(job);
    queue = run.catch(() => undefined);
    return run;
  };

  api.register(async (admin) => {
    admin.addHook('preHandler', async (request, reply) => {
      if (request.actor?.role !== 'admin') return refuse(reply, 403, 'forbidden', 'Only admins can manage users.');
    });

    admin.get('/api/admin/users', async () => (await store.listUsers()).map(toAdminUser));

    admin.get('/api/admin/backup', async (_request, reply) => {
      const at = now();
      reply.header('content-disposition', `attachment; filename="glasshouse-backup-${localDay(at)}.json"`);
      return exportBackup(service.state.workspace, at.toISOString());
    });

    admin.post('/api/admin/users', (request, reply) => serialized(async () => {
      if (!localLogin) return refuse(reply, 400, 'invalid_value', 'Sign-in with a password is switched off; people join through the company account.');
      const body = createBody.safeParse(request.body);
      if (!body.success) return refuse(reply, 400, 'invalid_value', 'Give an email, a name and a role.');
      const temp = temporaryPassword();
      const user: User = {
        id: randomUUID(), email: body.data.email, displayName: body.data.displayName, role: body.data.role, source: 'local', oidcSubject: null,
        passwordHash: await hashPassword(temp), mustChangePassword: true, nameLocked: false, active: true, createdAt: now().toISOString(), lastLoginAt: null,
      };
      try {
        await store.createUser(user);
      } catch (e) {
        if (e instanceof DuplicateUserError) return refuse(reply, 409, 'invalid_value', 'Someone with this email already has an account.');
        throw e;
      }
      return reply.code(201).send({ user: toAdminUser(user), temporaryPassword: temp });
    }));

    admin.patch('/api/admin/users/:id', (request, reply) => serialized(async () => {
      const { id } = request.params as { id: string };
      const body = patchBody.safeParse(request.body);
      if (!body.success) return refuse(reply, 400, 'invalid_value', 'Nothing to change.');
      const target = await store.findUserById(id);
      if (!target) return refuse(reply, 404, 'not_found', 'That user no longer exists.');
      const losesAdmin = target.role === 'admin' && target.active && ((body.data.role !== undefined && body.data.role !== 'admin') || body.data.active === false);
      if (id === request.actor!.id && (losesAdmin || body.data.active === false)) return refuse(reply, 409, 'invalid_value', 'You can’t remove your own admin access or switch yourself off. Ask another admin.');
      if (losesAdmin && (await store.countActiveAdmins()) <= 1) return refuse(reply, 409, 'invalid_value', 'This is the last admin. Make someone else an admin first.');
      const updated = await store.updateUser(id, { ...body.data, ...(body.data.displayName !== undefined ? { nameLocked: true } : {}) });
      if (body.data.active === false) await store.deleteUserSessions(id);
      return updated ? toAdminUser(updated) : refuse(reply, 404, 'not_found', 'That user no longer exists.');
    }));

    admin.delete('/api/admin/users/:id', (request, reply) => serialized(async () => {
      const { id } = request.params as { id: string };
      const target = await store.findUserById(id);
      if (!target) return refuse(reply, 404, 'not_found', 'That user no longer exists.');
      if (id === request.actor!.id) return refuse(reply, 409, 'invalid_value', 'You can’t delete your own account. Ask another admin.');
      // A switched-off admin is not counted, so this only trips if the rules above are ever loosened.
      if (target.role === 'admin' && target.active && (await store.countActiveAdmins()) <= 1) return refuse(reply, 409, 'invalid_value', 'This is the last admin. Make someone else an admin first.');
      if (target.active) return refuse(reply, 409, 'invalid_value', `Switch ${target.displayName} off before deleting the account.`);
      if (!(await store.deleteUser(id))) return refuse(reply, 404, 'not_found', 'That user no longer exists.');
      claims?.releaseAllFor(id);
      // Who did it is the only record of an admin action; history on rooms keeps the name as recorded, not a link to this row.
      request.log.info(
        { event: 'user_deleted', actorId: request.actor!.id, actorName: request.actor!.name, userId: target.id, userEmail: target.email, userName: target.displayName, userRole: target.role, source: target.source, at: now().toISOString() },
        'Account deleted',
      );
      return reply.code(204).send();
    }));

    admin.post('/api/admin/users/:id/reset-password', (request, reply) => serialized(async () => {
      const { id } = request.params as { id: string };
      const target = await store.findUserById(id);
      if (!target) return refuse(reply, 404, 'not_found', 'That user no longer exists.');
      if (target.source !== 'local') return refuse(reply, 400, 'invalid_value', 'This person signs in with the company account; reset it there.');
      const temp = temporaryPassword();
      await store.updateUser(id, { passwordHash: await hashPassword(temp), mustChangePassword: true });
      await store.deleteUserSessions(id);
      return { temporaryPassword: temp };
    }));
  });
}
