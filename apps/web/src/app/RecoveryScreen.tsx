import { createWorkspace } from '@glasshouse/domain';
import { useState } from 'react';
import type { Repository } from '../storage/repository';
import { useWorkspaceStore } from '../store/workspaceStore';

interface RecoveryScreenProps {
  reason: string;
  raw: unknown;
  repository: Repository;
}

export function RecoveryScreen({ reason, raw, repository }: RecoveryScreenProps) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      setError(`Couldn't write a fresh workspace: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }
    const store = useWorkspaceStore.getState();
    store.replace(fresh);
    store.setLoad({ kind: 'ready' });
  };

  return (
    <main className="recovery">
      <h1>Glasshouse couldn't open your saved workspace</h1>
      <p className="recovery__reason mono">{reason}</p>
      <p>Nothing has been deleted. Download the saved data first so it can be recovered, then start a fresh workspace if you need to keep working.</p>
      <div className="recovery__actions">
        <button type="button" className="btn" onClick={download} disabled={raw === null}>
          Download saved data
        </button>
        {confirming ? (
          <>
            <button type="button" className="btn btn--danger" onClick={() => void startFresh()}>
              Replace it with a fresh workspace
            </button>
            <button type="button" className="btn btn--quiet" onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </>
        ) : (
          <button type="button" className="btn" onClick={() => setConfirming(true)}>
            Start a fresh workspace
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
