import { newId, parseWorkspace, type DomainError, type Result, type Workspace, type WorkspaceCommand } from '@glasshouse/domain';
import { AuthError } from '../auth/authApi';
import type { Claim } from '../claims/claimsStore';
import type { SaveState } from '../store/workspaceStore';
import { SyncEngine, type Dropped, type ServerEvent } from './syncEngine';

export interface BatchOutcome {
  accepted: { commandId: string; seq: number }[];
  rejected: { commandId: string; error: DomainError } | null;
  skipped: string[];
}

export interface EventHandlers {
  onOpen(): void;
  /** The first frame of every stream: which server process this is. A different one than the snapshot's means a restart or restore. */
  onHello(generation: string): void;
  onCommand(event: ServerEvent): void;
  onResync(): void;
  /** The server's periodic `ping` event: proof the stream is alive even when no edits flow. */
  onHeartbeat(): void;
  /** The server's live list of who is editing which room. */
  onClaims(claims: Claim[]): void;
  /** `closed`: the browser gave up on the stream (it won't retry by itself). */
  onError(closed: boolean): void;
}

export interface Transport {
  fetchWorkspace(): Promise<{ seq: number; workspace: unknown; claims?: Claim[]; generation?: string }>;
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
  /** True while any edit is unsent or unacknowledged; called only when that changes. */
  onUnsaved(hasUnsaved: boolean): void;
  /** The session ended (or needs a new password): the client has stopped; unsent edits stay in `pendingCommands()`. */
  onAuthLost(): void;
  onClaims?(claims: Claim[]): void;
  /** Someone else holds the room: this tab's edits to it were refused. `workspace` is this tab's version from before they were dropped. */
  onClaimLost?(lost: { roomId: string; workspace: Workspace; changes: number }): void;
}

const RETRY_MIN_MS = 500;
const RETRY_MAX_MS = 15_000;
/** Two missed 15 s server heartbeats plus slack: past this, the stream is treated as dead. */
export const WATCHDOG_MS = 35_000;
const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const describe = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** Talks to the server for one tab: batches edits, retries them with the same IDs, follows the event stream. */
export class SyncClient {
  private readonly engine: SyncEngine;
  private readonly id: string;
  private readonly newId: () => string;
  private flushing: Promise<void> | null = null;
  private closeEvents: (() => void) | null = null;
  private resyncing = false;
  private paused = false;
  /** Resyncs from a seq gap or an event that won't apply, and from the server asking: they slow retries down. */
  private resyncCount = 0;
  /** Only the first kind: the page itself is out of step with the server. */
  private outOfStepCount = 0;
  private unsaved = false;
  private reconnectMs = RETRY_MIN_MS;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private authLost = false;
  private watchdog: ReturnType<typeof setTimeout> | null = null;
  private generation: string | undefined;

  constructor(
    private readonly transport: Transport,
    start: { seq: number; workspace: Workspace; generation?: string },
    private readonly callbacks: SyncCallbacks,
    ids: { clientId?: string; newId?: () => string } = {},
  ) {
    this.id = ids.clientId ?? newId();
    this.newId = ids.newId ?? newId;
    this.engine = new SyncEngine(start, this.id);
    this.generation = start.generation;
  }

  get workspace(): Workspace {
    return this.engine.workspace;
  }

  get clientId(): string {
    return this.id;
  }

  pendingCommands(): { commandId: string; command: WorkspaceCommand }[] {
    return this.engine.pendingList();
  }

  start(): void {
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.clearWatchdog();
    this.closeEvents?.();
    this.closeEvents = null;
    this.unsaved = false;
  }

  /** The store calls this for every edit; the returned workspace is what the screen shows. */
  dispatch(command: WorkspaceCommand): Result<Workspace> {
    const error = this.engine.local(this.newId(), command);
    if (error) return { ok: false, error };
    this.notifyUnsaved();
    this.callbacks.onSave({ kind: 'saving' });
    if (!this.paused && !this.authLost) void this.flush();
    return { ok: true, value: this.engine.workspace };
  }

  /** Sends everything queued; resolves when every sent edit has an answer from the server. */
  flush(): Promise<void> {
    if (this.authLost) return Promise.resolve();
    this.flushing ??= this.sendAll().finally(() => {
      this.flushing = null;
    });
    return this.flushing;
  }

  private async sendAll(): Promise<void> {
    let retryMs = RETRY_MIN_MS;
    while (!this.stopped && !this.paused) {
      const batch = this.engine.takeUnsent();
      if (batch.length === 0) break;
      let outcome: BatchOutcome;
      try {
        outcome = await this.transport.postCommands(this.id, batch);
      } catch (e) {
        this.engine.markUnsent(batch.map((b) => b.commandId));
        if (e instanceof AuthError) {
          this.loseAuth();
          return;
        }
        this.callbacks.onSave({ kind: 'failed', reason: `${describe(e)}. Retrying…` });
        await delay(retryMs);
        retryMs = Math.min(retryMs * 2, RETRY_MAX_MS);
        continue;
      }
      retryMs = RETRY_MIN_MS;
      for (const a of outcome.accepted) this.report(this.engine.acked(a.commandId, a.seq));
      if (outcome.rejected) {
        const { commandId, error } = outcome.rejected;
        const roomId = error.code === 'claimed' ? error.targets[0] : undefined;
        if (roomId) {
          // Keep this tab's version before dropping it: the person can download it (Decision 2).
          const mine = this.engine.workspace;
          const before = this.engine.pendingList().length;
          const dropped = this.engine.dropDraftEdits(roomId);
          this.callbacks.onClaimLost?.({ roomId, workspace: mine, changes: before - this.engine.pendingList().length });
          this.report(dropped.filter((d) => d.commandId !== commandId));
        } else {
          this.report([{ commandId, error }, ...this.engine.rejected(commandId)]);
        }
      }
      this.engine.markUnsent(outcome.skipped);
    }
    if (!this.stopped && !this.paused) this.callbacks.onSave({ kind: 'saved', at: new Date() });
  }

  private loseAuth(): void {
    this.authLost = true;
    this.stop();
    this.callbacks.onAuthLost();
  }

  private notifyUnsaved(): void {
    const has = this.engine.hasUnsaved();
    if (has === this.unsaved) return;
    this.unsaved = has;
    this.callbacks.onUnsaved(has);
  }

  private report(dropped: Dropped[]): void {
    this.notifyUnsaved();
    if (dropped.length > 0) this.callbacks.onDropped(dropped);
    this.callbacks.onWorkspace(this.engine.workspace);
  }

  private connect(): void {
    if (this.stopped) return;
    this.callbacks.onConnection('connecting');
    this.resetWatchdog();
    this.closeEvents = this.transport.openEvents(this.engine.seq, {
      onOpen: () => {
        this.resetWatchdog();
        this.reconnectMs = RETRY_MIN_MS;
        this.callbacks.onConnection('live');
      },
      onHello: (generation) => {
        this.resetWatchdog();
        const known = this.generation;
        this.generation = generation;
        // A restored or restarted server may hold different history under the same seq numbers: start over from its snapshot.
        if (known !== undefined && known !== generation) void this.resync('server');
      },
      onCommand: (event) => {
        this.resetWatchdog();
        const result = this.engine.remote(event);
        if (result.kind === 'resync') void this.resync('out-of-step');
        else if (result.kind === 'applied') {
          this.resyncCount = 0;
          this.outOfStepCount = 0;
          this.report(result.dropped);
        }
      },
      // The server asks when we are too far behind or it can't read its log; reloading fixes that, so it isn't the page being out of step.
      onResync: () => void this.resync('server'),
      onHeartbeat: () => this.resetWatchdog(),
      onClaims: (claims) => this.callbacks.onClaims?.(claims),
      onError: (closed) => {
        this.callbacks.onConnection('offline');
        // Otherwise EventSource reconnects by itself and sends Last-Event-ID, so the server sends what we missed.
        if (closed) this.scheduleResync();
      },
    });
  }

  /** Half-open connections raise no error event; silence is the only sign, so silence past WATCHDOG_MS counts as a closed stream. */
  private resetWatchdog(): void {
    this.clearWatchdog();
    if (this.stopped) return;
    this.watchdog = setTimeout(() => {
      this.watchdog = null;
      this.callbacks.onConnection('offline');
      this.scheduleResync();
    }, WATCHDOG_MS);
  }

  private clearWatchdog(): void {
    if (this.watchdog) clearTimeout(this.watchdog);
    this.watchdog = null;
  }

  private scheduleResync(): void {
    if (this.reconnectTimer || this.stopped) return;
    this.clearWatchdog();
    this.closeEvents?.();
    this.closeEvents = null;
    const wait = this.reconnectMs;
    this.reconnectMs = Math.min(wait * 2, RETRY_MAX_MS);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.resync('connection');
    }, wait);
  }

  private async resync(cause: 'out-of-step' | 'server' | 'connection'): Promise<void> {
    if (this.resyncing || this.stopped) return;
    this.resyncing = true;
    if (cause !== 'connection') this.resyncCount += 1;
    if (cause === 'out-of-step') this.outOfStepCount += 1;
    this.clearWatchdog();
    this.closeEvents?.();
    this.closeEvents = null;
    this.callbacks.onConnection('connecting');
    for (;;) {
      try {
        // Every sent edit gets its verdict first, so the fresh state tells us exactly which are already in.
        do await this.flush();
        while (this.flushing);
        // Nothing may be posted while the snapshot loads, or it could contain an edit we'd then replay on top.
        this.paused = true;
        const snapshot = await this.transport.fetchWorkspace();
        const parsed = parseWorkspace(snapshot.workspace);
        if (!parsed.ok) throw new Error(parsed.error.message);
        this.report(this.engine.reset({ seq: snapshot.seq, workspace: parsed.value }));
        this.generation = snapshot.generation ?? this.generation;
        this.callbacks.onClaims?.(snapshot.claims ?? []);
        this.paused = false;
        break;
      } catch (e) {
        this.paused = false;
        if (e instanceof AuthError) {
          this.resyncing = false;
          this.loseAuth();
          return;
        }
        void this.flush();
        this.callbacks.onConnection('offline');
        this.callbacks.onSave({ kind: 'failed', reason: `Couldn't reload from the server: ${describe(e)}. Retrying…` });
        await delay(RETRY_MAX_MS);
        if (this.stopped) return;
      }
    }
    // Repeated resyncs mean events keep failing to apply here (e.g. a version mismatch): slow down and say so.
    if (this.resyncCount >= 2) await delay(Math.min(RETRY_MIN_MS * 2 ** (this.resyncCount - 2), RETRY_MAX_MS));
    if (this.outOfStepCount >= 3) {
      this.callbacks.onSave({ kind: 'failed', reason: 'This page is out of step with the server. Reload to continue.' });
    }
    this.resyncing = false;
    if (this.stopped) return;
    void this.flush();
    this.connect();
  }
}
