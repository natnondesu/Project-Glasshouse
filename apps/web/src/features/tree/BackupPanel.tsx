import { backupDue, daysSinceBackup, exportBackup, parseBackup, type Workspace } from '@glasshouse/domain';
import { useRef, useState } from 'react';
import { readOnlyMessage } from '../../store/readOnlyMessage';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { downloadJson, readJsonFile } from '../../ui/files';
import { formatTime } from '../../ui/time';
import { useT, type Messages } from '../../i18n';

function statusText(m: Messages, ws: Workspace, now: Date): string {
  const days = daysSinceBackup(ws, now);
  if (days === null) return ws.projects.some((p) => !p.isSample) ? m.backup.notYet : m.backup.nothing;
  if (days === 0) return m.backup.today;
  return backupDue(ws, now) ? m.backup.overdue(days) : m.backup.ago(days);
}

export function BackupPanel() {
  const workspace = useWorkspaceStore((s) => s.workspace);
  const readOnly = useWorkspaceStore((s) => s.readOnly);
  const readOnlyReason = useWorkspaceStore((s) => s.readOnlyReason);
  const dispatch = useWorkspaceStore((s) => s.dispatch);
  const fileInput = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<Workspace | null>(null);
  const [error, setError] = useState<string | null>(null);
  const now = new Date();
  const m = useT();
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
      setError(readOnlyMessage(m, readOnlyReason));
      return;
    }
    useWorkspaceStore.getState().replace(pending);
    setPending(null);
  };

  return (
    <section className={`backup${due ? ' backup--due' : ''}`} aria-label={m.backup.region}>
      <p className="backup__status">
        <strong>{statusText(m, workspace, now)}</strong>
        {due ? m.backup.onlyHere : ''}
      </p>
      <div className="backup__actions">
        <button type="button" className="btn btn--sm" onClick={backUp}>
          {m.backup.backUp}
        </button>
        <button type="button" className="btn btn--sm btn--quiet" onClick={() => fileInput.current?.click()}>
          {m.backup.restore}
        </button>
      </div>
      <input
        ref={fileInput}
        type="file"
        accept=".json,application/json"
        hidden
        aria-label={m.backup.chooseFile}
        onChange={(e) => {
          void onFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      {pending ? (
        <div className="backup__confirm" role="group" aria-label={m.backup.confirm}>
          <p>
            {m.backup.replaceQuestion(formatTime(pending.lastBackupAt), pending.projects.length)}
          </p>
          <div className="backup__actions">
            <button type="button" className="btn btn--sm" onClick={backUp}>
              {m.backup.backUpFirst}
            </button>
            <button type="button" className="btn btn--sm btn--danger" onClick={restore}>
              {m.backup.replace}
            </button>
            <button type="button" className="btn btn--sm btn--quiet" onClick={() => setPending(null)}>
              {m.common.cancel}
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
