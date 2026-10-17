import type { FastifyInstance } from 'fastify';
import type { LoggedCommand } from '../store/commandStore';
import type { WorkspaceService } from '../workspaceService';

export const MAX_CATCH_UP = 1000;
const HEARTBEAT_MS = 20_000;

const frame = (e: LoggedCommand): string =>
  `id: ${e.seq}\nevent: command\ndata: ${JSON.stringify({ seq: e.seq, clientId: e.clientId, commandId: e.commandId, command: e.command })}\n\n`;

export function registerEvents(app: FastifyInstance, service: WorkspaceService): void {
  app.get('/api/events', async (request, reply) => {
    const header = request.headers['last-event-id'];
    const query = (request.query as { after?: string }).after;
    const after = Number(typeof header === 'string' && header !== '' ? header : (query ?? Number.NaN));
    if (!Number.isInteger(after) || after < 0) {
      return reply.code(400).send({ error: { code: 'invalid_value', message: 'Say which sequence number you already have (after=N).', targets: [] } });
    }
    reply.hijack();
    const raw = reply.raw;
    raw.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive', 'x-accel-buffering': 'no' });

    // Subscribe before reading the backlog and buffer live events until it is written, so nothing falls in between.
    let last = after;
    let live = false;
    const buffered: LoggedCommand[] = [];
    const send = (e: LoggedCommand): void => {
      if (e.seq <= last) return;
      raw.write(frame(e));
      last = e.seq;
    };
    const unsubscribe = service.subscribe((e) => (live ? send(e) : buffered.push(e)));
    const heartbeat = setInterval(() => raw.write(': ping\n\n'), HEARTBEAT_MS);
    const cleanup = (): void => {
      clearInterval(heartbeat);
      unsubscribe();
    };
    request.raw.on('close', cleanup);

    let missed: LoggedCommand[];
    try {
      missed = await service.commandsAfter(after, MAX_CATCH_UP + 1);
    } catch (e) {
      // Headers are already sent, so a 500 is impossible; tell the client to reload instead of leaving a dead stream.
      request.log.error(e, 'Could not read the command backlog for an event stream');
      raw.write('event: resync\ndata: {}\n\n');
      cleanup();
      raw.end();
      return;
    }
    // Ahead of the server (database restored from a backup) or too far behind: reload the whole workspace.
    if (after > service.state.seq || missed.length > MAX_CATCH_UP) {
      raw.write('event: resync\ndata: {}\n\n');
      cleanup();
      raw.end();
      return;
    }
    missed.forEach(send);
    buffered.forEach(send);
    live = true;
  });
}
