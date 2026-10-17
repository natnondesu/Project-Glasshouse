import { findRoom } from '@glasshouse/domain';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { CLAIM_IDLE_MS, type ClaimRegistry } from '../claims';
import { atLeast } from '../identity/types';
import type { WorkspaceService } from '../workspaceService';

const refuse = (reply: FastifyReply, status: number, code: string, message: string, targets: string[] = []) => reply.code(status).send({ error: { code, message, targets } });
const IDLE_MINUTES = CLAIM_IDLE_MS / 60_000;
const params = z.object({ roomId: z.string().min(1).max(100) });

export function registerClaims(api: FastifyInstance, { service, claims }: { service: WorkspaceService; claims: ClaimRegistry }): void {
  api.post('/api/claims/:roomId', async (request, reply) => {
    const actor = request.actor!;
    const p = params.safeParse(request.params);
    if (!p.success) return refuse(reply, 400, 'invalid_value', 'Say which room.');
    if (!atLeast(actor.role, 'editor')) return refuse(reply, 403, 'forbidden', "Viewers can't edit rooms. Ask an admin for Editor access.");
    if (!findRoom(service.state.workspace, p.data.roomId)) return refuse(reply, 404, 'not_found', 'That room no longer exists.', [p.data.roomId]);
    const outcome = claims.claim(p.data.roomId, actor, { admin: actor.role === 'admin' });
    if (!outcome.ok) {
      return refuse(reply, 409, 'claimed', `${outcome.claim.name} is editing this room. You can take over after ${IDLE_MINUTES} minutes without edits, or ask an admin.`, [p.data.roomId]);
    }
    return { claim: outcome.claim };
  });

  api.delete('/api/claims/:roomId', async (request, reply) => {
    const p = params.safeParse(request.params);
    if (!p.success) return refuse(reply, 400, 'invalid_value', 'Say which room.');
    claims.release(p.data.roomId, request.actor!.id, { admin: request.actor!.role === 'admin' });
    return reply.code(204).send();
  });
}
