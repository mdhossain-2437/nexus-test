import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: string | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { error: error instanceof Error ? error.message : String(error) };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="fixed inset-0 flex flex-col items-center justify-center gap-3 bg-[var(--color-ink)] p-6 text-center">
          <span className="label text-[var(--color-accent)]!">Rendering pipeline error</span>
          <p className="max-w-md text-[13px] text-[var(--color-text-dim)]">{this.state.error}</p>
          <button className="btn border border-[var(--color-line)] mt-2" onClick={() => window.location.reload()}>
            Reload NEXUS
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
