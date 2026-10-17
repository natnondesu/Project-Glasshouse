import { apply, type DomainError, type Workspace, type WorkspaceCommand } from '@glasshouse/domain';

export interface ServerEvent {
  seq: number;
  clientId: string;
  commandId: string;
  command: WorkspaceCommand;
}

export interface Dropped {
  commandId: string;
  error: DomainError;
}

interface Pending {
  commandId: string;
  command: WorkspaceCommand;
  sent: boolean;
  /** The seq the server gave it; once confirmed state reaches it, the edit is part of confirmed state. */
  ackedSeq?: number;
}

/** The server accepts at most this many commands in one request (its BATCH_MAX). */
export const MAX_BATCH = 500;

export type RemoteResult = { kind: 'applied'; dropped: Dropped[] } | { kind: 'ignored' } | { kind: 'resync' };

/**
 * On screen = the server's confirmed state + this tab's edits it hasn't ordered yet.
 * Confirmed state only moves forward through server events, in seq order. No I/O here.
 */
export class SyncEngine {
  private confirmed: Workspace;
  private confirmedSeq: number;
  private pending: Pending[] = [];
  private view: Workspace;

  constructor(
    start: { seq: number; workspace: Workspace },
    private readonly clientId: string,
  ) {
    this.confirmed = start.workspace;
    this.confirmedSeq = start.seq;
    this.view = start.workspace;
  }

  get workspace(): Workspace {
    return this.view;
  }

  get seq(): number {
    return this.confirmedSeq;
  }

  local(commandId: string, command: WorkspaceCommand): DomainError | null {
    const result = apply(this.view, command);
    if (!result.ok) return result.error;
    this.view = result.value;
    this.pending = [...this.pending, { commandId, command, sent: false }];
    return null;
  }

  takeUnsent(limit = MAX_BATCH): { commandId: string; command: WorkspaceCommand }[] {
    const taken = new Set(this.pending.filter((p) => !p.sent).slice(0, limit).map((p) => p.commandId));
    this.pending = this.pending.map((p) => (taken.has(p.commandId) ? { ...p, sent: true } : p));
    return this.pending.filter((p) => taken.has(p.commandId)).map(({ commandId, command }) => ({ commandId, command }));
  }

  /** True while an edit is unsent or the server hasn't yet said it took it. */
  hasUnsaved(): boolean {
    return this.pending.some((p) => p.ackedSeq === undefined);
  }

  markUnsent(ids: string[]): void {
    const set = new Set(ids);
    this.pending = this.pending.map((p) => (set.has(p.commandId) ? { ...p, sent: false } : p));
  }

  acked(commandId: string, seq: number): Dropped[] {
    this.pending = this.pending.map((p) => (p.commandId === commandId ? { ...p, ackedSeq: seq } : p));
    return seq <= this.confirmedSeq ? this.rebuild() : [];
  }

  rejected(commandId: string): Dropped[] {
    this.pending = this.pending.filter((p) => p.commandId !== commandId);
    return this.rebuild();
  }

  remote(event: ServerEvent): RemoteResult {
    if (event.seq <= this.confirmedSeq) return { kind: 'ignored' };
    if (event.seq !== this.confirmedSeq + 1) return { kind: 'resync' };
    const result = apply(this.confirmed, event.command);
    // The server accepted it, so failing here means our copy drifted: start again from the server.
    if (!result.ok) return { kind: 'resync' };
    this.confirmed = result.value;
    this.confirmedSeq = event.seq;
    if (event.clientId === this.clientId) this.pending = this.pending.filter((p) => p.commandId !== event.commandId);
    return { kind: 'applied', dropped: this.rebuild() };
  }

  /** A fresh workspace from the server (after a gap). Edits it already contains are dropped silently. */
  reset(start: { seq: number; workspace: Workspace }): Dropped[] {
    this.confirmed = start.workspace;
    this.confirmedSeq = start.seq;
    return this.rebuild();
  }

  private rebuild(): Dropped[] {
    const dropped: Dropped[] = [];
    const kept: Pending[] = [];
    let ws = this.confirmed;
    for (const p of this.pending) {
      if (p.ackedSeq !== undefined && p.ackedSeq <= this.confirmedSeq) continue;
      const result = apply(ws, p.command);
      if (result.ok) {
        ws = result.value;
        kept.push(p);
      } else {
        dropped.push({ commandId: p.commandId, error: result.error });
      }
    }
    this.pending = kept;
    this.view = ws;
    return dropped;
  }
}
