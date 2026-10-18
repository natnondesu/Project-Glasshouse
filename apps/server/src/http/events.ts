import type { FastifyInstance } from 'fastify';
import type { ClaimRegistry } from '../claims';
import type { Authenticate } from './devAuth';
import { roomEditOf } from '../roomEdits';
import type { LoggedCommand } from '../store/commandStore';
import type { WorkspaceService } from '../workspaceService';

export const MAX_CATCH_UP = 1000;
/** A real event (not a comment) so the browser's EventSource hands it to the page, which uses it to spot a dead connection. */
export const HEARTBEAT_MS = 15_000;

// `edit` names who changed a room (signed-in people only), so Home's "edited by" stays current without a reload.
const frame = (e: LoggedCommand): string =>
  `id: ${e.seq}\nevent: command\ndata: ${JSON.stringify({ seq: e.seq, clientId: e.clientId, commandId: e.commandId, command: e.command, edit: roomEditOf(e) ?? undefined })}\n\n`;

export function registerEvents(app: FastifyInstance, service: WorkspaceService, authenticate: Authenticate, { heartbeatMs = HEARTBEAT_MS, claims }: { heartbeatMs?: number; claims?: ClaimRegistry } = {}): void {
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
    // Node holds headers until the first write; without this the browser's `open` waits for the first frame.
    raw.flushHeaders();
    // First frame: lets the page notice a restart (a restore from backup keeps the seq but not the history).
    raw.write(`event: hello\ndata: ${JSON.stringify({ generation: service.generation })}\n\n`);

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
    let ended = false;
    let checking = false;
    let unsubscribeClaims: (() => void) | undefined;
    const cleanup = (): void => {
      ended = true;
      clearInterval(heartbeat);
      unsubscribe();
      unsubscribeClaims?.();
    };
    // The session was checked once at connect. Re-check on every beat so switching a user off, signing out,
    // a password reset or an expired session cuts the stream; the client reconnects and meets the 401.
    const beat = async (): Promise<void> => {
      if (checking || ended) return;
      checking = true;
      try {
        const actor = await authenticate(request);
        if (ended) return;
        if (!actor || actor.mustChangePassword) {
          cleanup();
          raw.end();
          return;
        }
        raw.write('event: ping\ndata: {}\n\n');
      } catch (e) {
        request.log.error(e, 'Could not re-check the session of an event stream; closing it');
        cleanup();
        raw.end();
      } finally {
        checking = false;
      }
    };
    const heartbeat = setInterval(() => void beat(), heartbeatMs);
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
    if (ended) return;
    missed.forEach(send);
    buffered.forEach(send);
    live = true;
    if (claims) {
      raw.write(`event: claims\ndata: ${JSON.stringify({ claims: claims.list() })}\n\n`);
      unsubscribeClaims = claims.subscribe((list) => {
        if (!ended && live) raw.write(`event: claims\ndata: ${JSON.stringify({ claims: list })}\n\n`);
      });
    }
  });
}
