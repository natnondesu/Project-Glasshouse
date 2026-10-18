import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  message: string;
  reload: string;
  /** A short first line, when the panel should say what is missing before why. */
  title?: string;
  /** What failed, for the console. */
  what?: string;
  onError?: () => void;
  children: ReactNode;
}

/**
 * The 3D (and the map) are the optional parts of Home: if their code fails to load or they crash, say so in their own
 * panel and keep the text and buttons, instead of letting the error take the whole page.
 */
export class SceneBoundary extends Component<Props, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`Glasshouse could not show ${this.props.what ?? 'the room in 3D'} on Home`, error, info.componentStack);
    this.props.onError?.();
  }

  override render(): ReactNode {
    if (this.state.failed) {
      return (
        <div className="home-hero__fallback" role="status">
          {this.props.title ? <p className="home-hero__fallback-title">{this.props.title}</p> : null}
          <p>{this.props.message}</p>
          {/* A module that failed to load stays failed until the page reloads; offer that directly. */}
          <button type="button" className="btn btn--sm" onClick={() => window.location.reload()}>
            {this.props.reload}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
