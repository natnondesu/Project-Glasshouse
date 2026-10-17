import type { WorkspaceCommand } from '@glasshouse/domain';
import { NetworkError, type BatchOutcome, type EventHandlers, type Transport } from './syncClient';
import type { ServerEvent } from './syncEngine';

const describe = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export function httpTransport(base = ''): Transport {
  return {
    async fetchWorkspace() {
      let res: Response;
      try {
        res = await fetch(`${base}/api/workspace`, { headers: { accept: 'application/json' } });
      } catch (e) {
        throw new NetworkError(`Can't reach the Glasshouse server (${describe(e)})`);
      }
      if (!res.ok) throw new NetworkError(`The Glasshouse server answered ${res.status}`);
      return (await res.json()) as { seq: number; workspace: unknown };
    },
    async postCommands(clientId: string, commands: { commandId: string; command: WorkspaceCommand }[]): Promise<BatchOutcome> {
      let res: Response;
      try {
        res = await fetch(`${base}/api/commands`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-glasshouse': '1' },
          body: JSON.stringify({ clientId, commands }),
        });
      } catch (e) {
        throw new NetworkError(`Can't reach the Glasshouse server (${describe(e)})`);
      }
      if (res.status >= 500) throw new NetworkError(`The Glasshouse server answered ${res.status}`);
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        const message = body?.error?.message ?? `The server refused the request (${res.status}).`;
        const [first, ...rest] = commands;
        return { accepted: [], rejected: { commandId: first!.commandId, error: { code: 'invalid_value', message, targets: [] } }, skipped: rest.map((c) => c.commandId) };
      }
      return (await res.json()) as BatchOutcome;
    },
    openEvents(after: number, handlers: EventHandlers) {
      const source = new EventSource(`${base}/api/events?after=${after}`);
      source.addEventListener('open', () => handlers.onOpen());
      source.addEventListener('command', (e) => handlers.onCommand(JSON.parse((e as MessageEvent<string>).data) as ServerEvent));
      source.addEventListener('resync', () => handlers.onResync());
      source.addEventListener('error', () => handlers.onError());
      return () => source.close();
    },
  };
}
