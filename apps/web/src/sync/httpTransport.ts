import type { WorkspaceCommand } from '@glasshouse/domain';
import { AuthError } from '../auth/authApi';
import type { Claim } from '../claims/claimsStore';
import { messagesFor, useLangStore } from '../i18n';
import { NetworkError, type BatchOutcome, type EventHandlers, type Transport } from './syncClient';
import type { ServerEvent } from './syncEngine';

/** A hung request becomes a NetworkError, which the sync client retries. */
const REQUEST_TIMEOUT_MS = 30_000;
const describe = (e: unknown): string => (e instanceof Error ? e.message : String(e));

async function authFailure(res: Response): Promise<AuthError | null> {
  if (res.status === 401) return new AuthError('unauthorised', messagesFor(useLangStore.getState().lang).auth.sessionGone);
  if (res.status === 403) {
    const body = (await res.clone().json().catch(() => null)) as { error?: { code?: string } } | null;
    if (body?.error?.code === 'password_change_required') return new AuthError('password_change_required', messagesFor(useLangStore.getState().lang).auth.passwordFirst);
  }
  return null;
}

const isTransient = (status: number): boolean => status >= 500 || status === 408 || status === 429;

async function errorEnvelope(res: Response): Promise<{ code: string; message?: string } | null> {
  const body = (await res.json().catch(() => null)) as { error?: { code?: unknown; message?: unknown } } | null;
  const code = body?.error?.code;
  if (typeof code !== 'string') return null;
  return { code, message: typeof body?.error?.message === 'string' ? body.error.message : undefined };
}

export function httpTransport(base = ''): Transport {
  return {
    async fetchWorkspace() {
      let res: Response;
      try {
        res = await fetch(`${base}/api/workspace`, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      } catch (e) {
        throw new NetworkError(`Can't reach the Glasshouse server (${describe(e)})`);
      }
      const auth = await authFailure(res);
      if (auth) throw auth;
      if (!res.ok) throw new NetworkError(`The Glasshouse server answered ${res.status}`);
      return (await res.json()) as { seq: number; workspace: unknown; claims?: Claim[]; generation?: string };
    },
    async postCommands(clientId: string, commands: { commandId: string; command: WorkspaceCommand }[]): Promise<BatchOutcome> {
      let res: Response;
      try {
        res = await fetch(`${base}/api/commands`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-glasshouse': '1' },
          body: JSON.stringify({ clientId, commands }),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
      } catch (e) {
        throw new NetworkError(`Can't reach the Glasshouse server (${describe(e)})`);
      }
      const auth = await authFailure(res);
      if (auth) throw auth;
      if (!res.ok) {
        // Only the server's own JSON error envelope on a plain 4xx is a refusal of the first command. A proxy page
        // (Traefik's plain-text 404 while the container restarts), 408, 429 and 5xx are transient: retry the batch as is.
        const refusal = isTransient(res.status) ? null : await errorEnvelope(res);
        if (!refusal) throw new NetworkError(`The Glasshouse server answered ${res.status}`);
        const [first, ...rest] = commands;
        return { accepted: [], rejected: { commandId: first!.commandId, error: { code: 'invalid_value', message: refusal.message ?? `The server refused the request (${res.status}).`, targets: [] } }, skipped: rest.map((c) => c.commandId) };
      }
      return (await res.json()) as BatchOutcome;
    },
    openEvents(after: number, handlers: EventHandlers) {
      const source = new EventSource(`${base}/api/events?after=${after}`);
      source.addEventListener('open', () => handlers.onOpen());
      source.addEventListener('hello', (e) => {
        const generation = (JSON.parse((e as MessageEvent<string>).data) as { generation?: unknown }).generation;
        if (typeof generation === 'string') handlers.onHello(generation);
      });
      source.addEventListener('command', (e) => handlers.onCommand(JSON.parse((e as MessageEvent<string>).data) as ServerEvent));
      source.addEventListener('ping', () => handlers.onHeartbeat());
      source.addEventListener('claims', (e) => handlers.onClaims((JSON.parse((e as MessageEvent<string>).data) as { claims: Claim[] }).claims));
      source.addEventListener('resync', () => handlers.onResync());
      source.addEventListener('error', () => handlers.onError(source.readyState === EventSource.CLOSED));
      return () => source.close();
    },
  };
}
