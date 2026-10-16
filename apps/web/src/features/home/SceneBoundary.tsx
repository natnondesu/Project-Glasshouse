import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * The 3D is the one optional part of Home: if its code fails to load or it crashes, say so in its own
 * panel and keep the room's text and buttons, instead of letting the error take the whole page.
 */
export class SceneBoundary extends Component<{ message: string; reload: string; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Glasshouse could not show the room in 3D on Home', error, info.componentStack);
  }

  override render(): ReactNode {
    if (this.state.failed) {
      return (
        <div className="home-hero__fallback" role="status">
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
