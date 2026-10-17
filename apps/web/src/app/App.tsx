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
import { messagesFor, useLangStore } from '../i18n';
import { SERVER_MODE, startServerSync } from '../sync/serverMode';

const router = createBrowserRouter(routes);

export function App({ repository = idbRepository }: { repository?: Repository }) {
  const load = useWorkspaceStore((s) => s.load);

  useEffect(() => {
    if (SERVER_MODE) {
      // StrictMode runs this twice: a cancelled start stops itself as soon as it finishes.
      let stop: (() => void) | null = null;
      let cancelled = false;
      void startServerSync().then((s) => (cancelled ? s() : (stop = s)));
      return () => {
        cancelled = true;
        stop?.();
      };
    }
    // The lock decides first, so a read-only tab never seeds or saves on first run.
    void acquireWriterLock()
      .then((isWriter) => useWorkspaceStore.getState().setReadOnly(!isWriter))
      .then(() => hydrate(repository));
    return startPersistence(repository);
  }, [repository]);

  if (load.kind === 'loading') {
    return (
      <p className="app-loading" role="status">
        {messagesFor(useLangStore.getState().lang).shell.opening}
      </p>
    );
  }
  if (load.kind === 'failed') {
    if (SERVER_MODE) {
      const m = messagesFor(useLangStore.getState().lang);
      return (
        <main className="app-loading" role="alert">
          <p>{m.shell.serverUnreachable(load.reason)}</p>
          <button type="button" className="btn" onClick={() => window.location.reload()}>
            {m.shell.tryAgain}
          </button>
        </main>
      );
    }
    return <RecoveryScreen reason={load.reason} raw={load.raw} repository={repository} />;
  }
  return (
    <ErrorBoundary label="Glasshouse">
      <RouterProvider router={router} />
    </ErrorBoundary>
  );
}
