import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[NEXUS] Unhandled UI error:', error.message, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="notice" role="alert">
          <h2>NEXUS encountered an error</h2>
          <p>{this.state.error.message}</p>
          <p>
            The 3D context has been halted to protect your session. Reloading the page will restore
            a clean state.
          </p>
          <button className="chip" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
