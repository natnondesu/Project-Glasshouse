import type { Workspace, WorkspaceCommand } from '@glasshouse/domain';

/** Who sent a command. Plan A: a dev stand-in; Plan B: the signed-in user. */
export interface Actor {
  id: string;
  name: string;
}

export interface LoggedCommand {
  seq: number;
  clientId: string;
  commandId: string;
  actor: Actor;
  command: WorkspaceCommand;
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
  append(entry: LoggedCommand): Promise<void>;
  saveSnapshot(seq: number, workspace: Workspace): Promise<void>;
  close(): Promise<void>;
}
