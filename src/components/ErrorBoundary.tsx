// Top-level error boundary: turns an uncaught render error into a friendly
// recovery screen instead of a blank white page. Game state is in-memory, so a
// reload returns to the menu (no progress persistence yet — see docs/BACKLOG.md).
import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props { children: ReactNode }
interface State { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Keep a console trace for debugging; no external logging wired yet.
    console.error("Unhandled error:", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="w-screen h-screen felt flex items-center justify-center p-6">
        <div className="glass rounded-2xl p-8 w-[min(92vw,440px)] text-center animate-floatIn">
          <h1 className="text-2xl font-semibold text-gold-400">Something went wrong</h1>
          <p className="mt-2 text-sm text-stone-300/80">
            The game hit an unexpected error. Reloading should get you back to the menu.
          </p>
          <button
            className="btn btn-primary mt-6 w-full"
            onClick={() => { window.location.href = "/"; }}
          >
            Reload
          </button>
          <p className="mt-4 text-[11px] text-stone-400/70 break-words">
            {this.state.error.message}
          </p>
        </div>
      </div>
    );
  }
}
