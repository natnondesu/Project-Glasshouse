import { Component, type ErrorInfo, type ReactNode } from 'react';
import { messagesFor, useLangStore } from '../i18n';
import { useWorkspaceStore } from '../store/workspaceStore';

interface Props {
  label: string;
  children: ReactNode;
}

interface State {
  error: Error | null;
}

function downloadWorkspace(): void {
  const blob = new Blob([JSON.stringify(useWorkspaceStore.getState().workspace, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `glasshouse-workspace-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

/** A render crash must never leave a blank screen: show the error and an escape hatch to the user's data. */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`Glasshouse crashed while drawing ${this.props.label}`, error, info.componentStack);
  }

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    // A class component can't use hooks; read the language directly.
    const m = messagesFor(useLangStore.getState().lang);
    return (
      <section className="recovery glass" role="alert">
        <h1>{m.crash.title(this.props.label)}</h1>
        <p className="recovery__reason mono">{error.message}</p>
        <p>{m.crash.stillSaved}</p>
        <div className="recovery__actions">
          <button type="button" className="btn" onClick={downloadWorkspace}>
            {m.crash.download}
          </button>
          <button type="button" className="btn btn--quiet" onClick={() => this.setState({ error: null })}>
            {m.crash.retry}
          </button>
        </div>
      </section>
    );
  }
}
