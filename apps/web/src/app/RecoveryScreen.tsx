import { createWorkspace } from '@glasshouse/domain';
import { useState } from 'react';
import type { Repository } from '../storage/repository';
import { useT } from '../i18n';
import { useWorkspaceStore } from '../store/workspaceStore';

interface RecoveryScreenProps {
  reason: string;
  raw: unknown;
  repository: Repository;
}

export function RecoveryScreen({ reason, raw, repository }: RecoveryScreenProps) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const m = useT();

  const download = (): void => {
    const blob = new Blob([JSON.stringify(raw, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `glasshouse-unreadable-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const startFresh = async (): Promise<void> => {
    const fresh = createWorkspace();
    try {
      await repository.save(fresh);
    } catch (e) {
      setError(m.crash.writeFailed(e instanceof Error ? e.message : String(e)));
      return;
    }
    const store = useWorkspaceStore.getState();
    store.replace(fresh);
    store.setLoad({ kind: 'ready' });
  };

  return (
    <main className="recovery glass">
      <h1>{m.crash.loadTitle}</h1>
      <p className="recovery__reason mono">{reason}</p>
      <p>{m.crash.loadBody}</p>
      <div className="recovery__actions">
        <button type="button" className="btn" onClick={download} disabled={raw === null}>
          {m.crash.downloadSaved}
        </button>
        {confirming ? (
          <>
            <button type="button" className="btn btn--danger" onClick={() => void startFresh()}>
              {m.crash.replace}
            </button>
            <button type="button" className="btn btn--quiet" onClick={() => setConfirming(false)}>
              {m.common.cancel}
            </button>
          </>
        ) : (
          <button type="button" className="btn" onClick={() => setConfirming(true)}>
            {m.crash.startFresh}
          </button>
        )}
      </div>
      {error ? (
        <p role="alert" className="recovery__error">
          {error}
        </p>
      ) : null}
    </main>
  );
}
