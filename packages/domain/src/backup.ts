import type { Workspace } from './model/types';
import { err, type Result } from './result';
import { parseWorkspace } from './schema';

export const BACKUP_FORMAT = 'glasshouse.workspace' as const;
export const BACKUP_REMINDER_DAYS = 7;
const DAY_MS = 86_400_000;

export interface WorkspaceBackup {
  format: typeof BACKUP_FORMAT;
  schemaVersion: number;
  exportedAt: string;
  workspace: Workspace;
}

export const exportBackup = (ws: Workspace, exportedAt: string): WorkspaceBackup => ({
  format: BACKUP_FORMAT,
  schemaVersion: ws.schemaVersion,
  exportedAt,
  workspace: { ...ws, lastBackupAt: exportedAt },
});

export function parseBackup(raw: unknown): Result<Workspace> {
  if (typeof raw !== 'object' || raw === null || (raw as { format?: unknown }).format !== BACKUP_FORMAT) {
    return err('invalid_value', "This isn't a Glasshouse workspace backup.");
  }
  return parseWorkspace((raw as { workspace?: unknown }).workspace);
}

export function daysSinceBackup(ws: Workspace, now: Date): number | null {
  if (!ws.lastBackupAt) return null;
  return Math.max(0, Math.floor((now.getTime() - Date.parse(ws.lastBackupAt)) / DAY_MS));
}

/** Only real work needs backing up; the Sample Project alone never nags. */
export function backupDue(ws: Workspace, now: Date): boolean {
  if (!ws.projects.some((p) => !p.isSample)) return false;
  const days = daysSinceBackup(ws, now);
  return days === null || days >= BACKUP_REMINDER_DAYS;
}
