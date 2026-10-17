import type { WorkspaceCommand } from '@glasshouse/domain';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { WorkspaceService } from '../workspaceService';

const ID_MAX = 100;
const BATCH_MAX = 500;

// The command itself is checked by the domain; here only the envelope.
const body = z.object({
  clientId: z.string().min(1).max(ID_MAX),
  commands: z.array(z.object({ commandId: z.string().min(1).max(ID_MAX), command: z.looseObject({ type: z.string().min(1) }) })).min(1).max(BATCH_MAX),
});

export function registerCommands(app: FastifyInstance, service: WorkspaceService): void {
  app.post('/api/commands', async (request, reply) => {
    const parsed = body.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: 'invalid_value', message: 'The request is not a list of commands.', targets: [] } });
    }
    const items = parsed.data.commands.map((c) => ({ commandId: c.commandId, command: c.command as unknown as WorkspaceCommand }));
    return service.submitBatch(parsed.data.clientId, items, request.actor!);
  });
}
