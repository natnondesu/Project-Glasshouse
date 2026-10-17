import { newId, parseWorkspace, type DomainError, type Result, type Workspace, type WorkspaceCommand } from '@glasshouse/domain';
import type { SaveState } from '../store/workspaceStore';
import { SyncEngine, type Dropped, type ServerEvent } from './syncEngine';

export interface BatchOutcome {
  accepted: { commandId: string; seq: number }[];
  rejected: { commandId: string; error: DomainError } | null;
  skipped: string[];
}

export interface EventHandlers {
  onOpen(): void;
  onCommand(event: ServerEvent): void;
  onResync(): void;
  onError(): void;
}

export interface Transport {
  fetchWorkspace(): Promise<{ seq: number; workspace: unknown }>;
  /** Throws NetworkError when the server can't be reached or fails (5xx); the batch is then retried as is. */
  postCommands(clientId: string, commands: { commandId: string; command: WorkspaceCommand }[]): Promise<BatchOutcome>;
  openEvents(after: number, handlers: EventHandlers): () => void;
}

export class NetworkError extends Error {}

export type ConnectionStatus = 'connecting' | 'live' | 'offline';

export interface SyncCallbacks {
  onWorkspace(ws: Workspace): void;
  onSave(save: SaveState): void;
  onConnection(status: ConnectionStatus): void;
  onDropped(dropped: Dropped[]): void;
}

const RETRY_MIN_MS = 500;
const RETRY_MAX_MS = 15_000;
const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const describe = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** Talks to the server for one tab: batches edits, retries them with the same IDs, follows the event stream. */
export class SyncClient {
  private readonly engine: SyncEngine;
  private readonly clientId: string;
  private readonly newId: () => string;
  private flushing: Promise<void> | null = null;
  private closeEvents: (() => void) | null = null;
  private resyncing = false;
  private stopped = false;

  constructor(
    private readonly transport: Transport,
    start: { seq: number; workspace: Workspace },
    private readonly callbacks: SyncCallbacks,
    ids: { clientId?: string; newId?: () => string } = {},
  ) {
    this.clientId = ids.clientId ?? newId();
    this.newId = ids.newId ?? newId;
    this.engine = new SyncEngine(start, this.clientId);
  }

  get workspace(): Workspace {
    return this.engine.workspace;
  }

  start(): void {
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    this.closeEvents?.();
    this.closeEvents = null;
  }

  /** The store calls this for every edit; the returned workspace is what the screen shows. */
  dispatch(command: WorkspaceCommand): Result<Workspace> {
    const error = this.engine.local(this.newId(), command);
    if (error) return { ok: false, error };
    this.callbacks.onSave({ kind: 'saving' });
    void this.flush();
    return { ok: true, value: this.engine.workspace };
  }

  /** Sends everything queued; resolves when every sent edit has an answer from the server. */
  flush(): Promise<void> {
    this.flushing ??= this.sendAll().finally(() => {
      this.flushing = null;
    });
    return this.flushing;
  }

  private async sendAll(): Promise<void> {
    let retryMs = RETRY_MIN_MS;
    while (!this.stopped) {
      const batch = this.engine.takeUnsent();
      if (batch.length === 0) break;
      let outcome: BatchOutcome;
      try {
        outcome = await this.transport.postCommands(this.clientId, batch);
      } catch (e) {
        this.engine.markUnsent(batch.map((b) => b.commandId));
        this.callbacks.onSave({ kind: 'failed', reason: `${describe(e)}. Retrying…` });
        await delay(retryMs);
        retryMs = Math.min(retryMs * 2, RETRY_MAX_MS);
        continue;
      }
      retryMs = RETRY_MIN_MS;
      for (const a of outcome.accepted) this.report(this.engine.acked(a.commandId, a.seq));
      if (outcome.rejected) {
        const { commandId, error } = outcome.rejected;
        this.report([{ commandId, error }, ...this.engine.rejected(commandId)]);
      }
      this.engine.markUnsent(outcome.skipped);
    }
    if (!this.stopped) this.callbacks.onSave({ kind: 'saved', at: new Date() });
  }

  private report(dropped: Dropped[]): void {
    if (dropped.length > 0) this.callbacks.onDropped(dropped);
    this.callbacks.onWorkspace(this.engine.workspace);
  }

  private connect(): void {
    if (this.stopped) return;
    this.callbacks.onConnection('connecting');
    this.closeEvents = this.transport.openEvents(this.engine.seq, {
      onOpen: () => this.callbacks.onConnection('live'),
      onCommand: (event) => {
        const result = this.engine.remote(event);
        if (result.kind === 'resync') void this.resync();
        else if (result.kind === 'applied') this.report(result.dropped);
      },
      onResync: () => void this.resync(),
      // EventSource reconnects by itself and sends Last-Event-ID, so the server sends what we missed.
      onError: () => this.callbacks.onConnection('offline'),
    });
  }

  private async resync(): Promise<void> {
    if (this.resyncing || this.stopped) return;
    this.resyncing = true;
    this.closeEvents?.();
    this.closeEvents = null;
    this.callbacks.onConnection('connecting');
    for (;;) {
      try {
        // Every sent edit gets its verdict first, so the fresh state tells us exactly which are already in.
        await this.flush();
        const snapshot = await this.transport.fetchWorkspace();
        const parsed = parseWorkspace(snapshot.workspace);
        if (!parsed.ok) throw new Error(parsed.error.message);
        this.report(this.engine.reset({ seq: snapshot.seq, workspace: parsed.value }));
        break;
      } catch (e) {
        this.callbacks.onConnection('offline');
        this.callbacks.onSave({ kind: 'failed', reason: `Couldn't reload from the server: ${describe(e)}. Retrying…` });
        await delay(RETRY_MAX_MS);
        if (this.stopped) return;
      }
    }
    this.resyncing = false;
    this.connect();
  }
}
