import { useEffect } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { idbRepository } from '../storage/idbRepository';
import type { Repository } from '../storage/repository';
import { hydrate, startPersistence } from '../store/persistence';
import { acquireWriterLock } from '../store/writerLock';
import { ErrorBoundary } from './ErrorBoundary';
import { useWorkspaceStore } from '../store/workspaceStore';
import { RecoveryScreen } from './RecoveryScreen';
import { routes } from './routes';

const router = createBrowserRouter(routes);

export function App({ repository = idbRepository }: { repository?: Repository }) {
  const load = useWorkspaceStore((s) => s.load);

  useEffect(() => {
    // The lock decides first, so a read-only tab never seeds or saves on first run.
    void acquireWriterLock()
      .then((isWriter) => useWorkspaceStore.getState().setReadOnly(!isWriter))
      .then(() => hydrate(repository));
    return startPersistence(repository);
  }, [repository]);

  if (load.kind === 'loading') {
    return (
      <p className="app-loading" role="status">
        Opening your workspace…
      </p>
    );
  }
  if (load.kind === 'failed') return <RecoveryScreen reason={load.reason} raw={load.raw} repository={repository} />;
  return (
    <ErrorBoundary label="Glasshouse">
      <RouterProvider router={router} />
    </ErrorBoundary>
  );
}
