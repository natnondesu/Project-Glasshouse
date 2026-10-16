import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * The 3D is the one optional part of Home: if its code fails to load or it crashes, say so in its own
 * panel and keep the room's text and buttons, instead of letting the error take the whole page.
 */
export class SceneBoundary extends Component<{ message: string; children: ReactNode }, { failed: boolean }> {
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
        <p className="home-hero__fallback" role="status">
          {this.props.message}
        </p>
      );
    }
    return this.props.children;
  }
}
