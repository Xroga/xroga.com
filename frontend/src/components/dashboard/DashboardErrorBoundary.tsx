'use client';

import { Component, type ReactNode } from 'react';
import { clearWorkspaceSession } from '@/lib/workspacePersistence';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

/** Prevents a bad chat session or component error from bricking the whole dashboard */
export class DashboardErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(err: Error) {
    console.error('[DashboardErrorBoundary]', err.message);
  }

  private resetWorkspace = () => {
    clearWorkspaceSession();
    this.setState({ hasError: false });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="max-w-lg mx-auto mt-16 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-6 text-center space-y-4">
          <h2 className="text-lg font-semibold text-[var(--foreground)]">Dashboard hit a snag</h2>
          <p className="text-sm text-[var(--muted)] leading-relaxed">
            A saved chat session or display glitch caused a client error. Your account is fine — reset
            the workspace session to continue building.
          </p>
          <button
            type="button"
            onClick={this.resetWorkspace}
            className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-[#006aff] text-white text-sm font-semibold hover:bg-[#0056cc] transition-colors"
          >
            Reset workspace &amp; reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
