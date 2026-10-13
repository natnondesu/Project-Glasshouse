import { backupDue, daysSinceBackup, exportBackup, parseBackup, type Workspace } from '@glasshouse/domain';
import { useRef, useState } from 'react';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { downloadJson, readJsonFile } from '../../ui/files';
import { formatTime } from '../../ui/time';

function statusText(ws: Workspace, now: Date): string {
  const days = daysSinceBackup(ws, now);
  if (days === null) return ws.projects.some((p) => !p.isSample) ? 'Not backed up yet.' : 'Nothing to back up yet.';
  if (days === 0) return 'Backed up today.';
  return `${backupDue(ws, now) ? 'No backup for' : 'Backed up'} ${days} ${days === 1 ? 'day' : 'days'}${backupDue(ws, now) ? '.' : ' ago.'}`;
}

export function BackupPanel() {
  const workspace = useWorkspaceStore((s) => s.workspace);
  const readOnly = useWorkspaceStore((s) => s.readOnly);
  const dispatch = useWorkspaceStore((s) => s.dispatch);
  const fileInput = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<Workspace | null>(null);
  const [error, setError] = useState<string | null>(null);
  const now = new Date();
  const due = backupDue(workspace, now);

  const backUp = (): void => {
    const at = new Date().toISOString();
    downloadJson(`glasshouse-backup-${at.slice(0, 10)}.json`, exportBackup(workspace, at));
    setError(dispatch({ type: 'backup/mark', at })?.message ?? null);
  };
  const onFile = async (file: File | undefined): Promise<void> => {
    if (!file) return;
    const read = await readJsonFile(file);
    if (!read.ok) {
      setError(read.message);
      return;
    }
    const parsed = parseBackup(read.value);
    if (!parsed.ok) {
      setError(parsed.error.message);
      return;
    }
    setError(null);
    setPending(parsed.value);
  };
  const restore = (): void => {
    if (!pending) return;
    if (readOnly) {
      setError('This tab is read-only because Glasshouse is open in another tab.');
      return;
    }
    useWorkspaceStore.getState().replace(pending);
    setPending(null);
  };

  return (
    <section className={`backup${due ? ' backup--due' : ''}`} aria-label="Workspace backup">
      <p className="backup__status">
        <strong>{statusText(workspace, now)}</strong>
        {due ? ' This workspace only lives in this browser.' : ''}
      </p>
      <div className="backup__actions">
        <button type="button" className="btn btn--sm" onClick={backUp}>
          Back up workspace
        </button>
        <button type="button" className="btn btn--sm btn--quiet" onClick={() => fileInput.current?.click()}>
          Restore…
        </button>
      </div>
      <input
        ref={fileInput}
        type="file"
        accept=".json,application/json"
        hidden
        aria-label="Choose a backup file"
        onChange={(e) => {
          void onFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      {pending ? (
        <div className="backup__confirm" role="group" aria-label="Confirm restore">
          <p>
            {`Replace everything in this browser with the backup from ${formatTime(pending.lastBackupAt)} (${pending.projects.length} ${pending.projects.length === 1 ? 'project' : 'projects'})? The current workspace will be lost.`}
          </p>
          <div className="backup__actions">
            <button type="button" className="btn btn--sm" onClick={backUp}>
              Back up current first
            </button>
            <button type="button" className="btn btn--sm btn--danger" onClick={restore}>
              Replace workspace
            </button>
            <button type="button" className="btn btn--sm btn--quiet" onClick={() => setPending(null)}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="tree__error">
          {error}
        </p>
      ) : null}
    </section>
  );
}
