import type { Workspace, WorkspaceCommand } from '@glasshouse/domain';
import type { Role } from '../identity/types';
import type { RoomEdit } from '../roomEdits';

/** Who sent a command: the signed-in user, or the unverified dev stand-in (GLASSHOUSE_AUTH=dev-insecure). */
export interface Actor {
  id: string;
  name: string;
  role: Role;
  /** False for the dev stand-in: nothing is stamped with its name. */
  verified: boolean;
  mustChangePassword?: boolean;
}

export interface LoggedCommand {
  seq: number;
  clientId: string;
  commandId: string;
  actor: Actor;
  command: WorkspaceCommand;
  /** When the server took it (ISO). Absent on entries built by hand in tests. */
  receivedAt?: string;
}

/** One approval, written with its command and never changed: the room may later be deleted, the record stays. */
export interface ApprovalRecord {
  seq: number;
  roomId: string;
  revision: number;
  contentHash: string;
  approverId: string;
  approverName: string;
  approvedAt: string;
}

/** Raw: a snapshot written by an older version is migrated by parseWorkspace on load. */
export interface StoredSnapshot {
  seq: number;
  workspace: unknown;
}

/** Append-only command log plus periodic snapshots. `append` throws on a repeated seq or (clientId, commandId). */
export interface CommandStore {
  latestSnapshot(): Promise<StoredSnapshot | null>;
  commandsAfter(seq: number, limit: number): Promise<LoggedCommand[]>;
  findCommand(clientId: string, commandId: string): Promise<LoggedCommand | null>;
  /** Writes the command and, for an approval, its record — both or neither. */
  append(entry: LoggedCommand, approval?: ApprovalRecord | null): Promise<void>;
  listApprovals(): Promise<ApprovalRecord[]>;
  /** The latest edit of each room by a signed-in person, read from the whole log (snapshots don't keep who did what). */
  lastRoomEdits(): Promise<RoomEdit[]>;
  saveSnapshot(seq: number, workspace: Workspace): Promise<void>;
  /** Throws when the database is unreachable. */
  ping(): Promise<void>;
  close(): Promise<void>;
}
