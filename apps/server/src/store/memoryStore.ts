import type { Workspace } from '@glasshouse/domain';
import type { ApprovalRecord, CommandStore, LoggedCommand, StoredSnapshot } from './commandStore';

/** For tests and the e2e server: same contract as Postgres, gone on restart. */
export class MemoryCommandStore implements CommandStore {
  private readonly log: LoggedCommand[] = [];
  private readonly approvals: ApprovalRecord[] = [];
  private snapshot: StoredSnapshot | null = null;

  async latestSnapshot(): Promise<StoredSnapshot | null> {
    return this.snapshot === null ? null : structuredClone(this.snapshot);
  }

  async commandsAfter(seq: number, limit: number): Promise<LoggedCommand[]> {
    return this.log.filter((c) => c.seq > seq).slice(0, limit).map((c) => structuredClone(c));
  }

  async findCommand(clientId: string, commandId: string): Promise<LoggedCommand | null> {
    const found = this.log.find((c) => c.clientId === clientId && c.commandId === commandId);
    return found ? structuredClone(found) : null;
  }

  async append(entry: LoggedCommand, approval: ApprovalRecord | null = null): Promise<void> {
    if (this.log.some((c) => c.seq === entry.seq)) throw new Error(`seq ${entry.seq} is already in the log.`);
    if (this.log.some((c) => c.clientId === entry.clientId && c.commandId === entry.commandId)) {
      throw new Error(`Command ${entry.commandId} from ${entry.clientId} is already logged.`);
    }
    // Clone both before pushing either, so a failing clone leaves nothing written.
    const storedEntry = structuredClone(entry);
    const storedApproval = approval ? structuredClone(approval) : null;
    this.log.push(storedEntry);
    if (storedApproval) this.approvals.push(storedApproval);
  }

  async listApprovals(): Promise<ApprovalRecord[]> {
    return structuredClone(this.approvals);
  }

  async saveSnapshot(seq: number, workspace: Workspace): Promise<void> {
    this.snapshot = { seq, workspace: structuredClone(workspace) };
  }

  async ping(): Promise<void> {}

  async close(): Promise<void> {}
}
