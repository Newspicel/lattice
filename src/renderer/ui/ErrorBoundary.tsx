import React from 'react';

interface State {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('Unhandled UI error:', error, info);
  }

  reset = (): void => {
    this.setState({ error: null });
  };

  render(): React.ReactNode {
    if (this.state.error) {
      return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-neutral-950 p-8 text-neutral-200">
          <h1 className="text-xl font-semibold">Something went wrong.</h1>
          <pre className="max-h-80 max-w-3xl overflow-auto rounded-md bg-[var(--color-panel)] p-4 text-xs">
            {this.state.error.stack ?? this.state.error.message}
          </pre>
          <button
            type="button"
            onClick={this.reset}
            className="rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-accent-hover)]"
          >
            Dismiss
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
