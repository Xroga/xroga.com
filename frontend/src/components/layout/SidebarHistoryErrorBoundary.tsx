'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';
import Link from 'next/link';

/**
 * Isolate the optional saved-work navigator from the application shell.
 * Bad browser caches, malformed legacy history and sidebar-only render errors
 * must never unmount the active conversation, composer or rest of navigation.
 */
export class SidebarHistoryErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[SidebarHistoryErrorBoundary]', {
      name: error.name,
      message: error.message,
      componentStack: info.componentStack,
    });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" className="mx-2 my-3 rounded-lg border border-[var(--card-border)] bg-[var(--card)] p-3 text-[var(--foreground)]">
        <p className="text-[11px] font-semibold">Saved work could not be displayed.</p>
        <p className="mt-1 text-[10px] leading-relaxed text-[var(--muted)]">
          Your projects and conversations have not been deleted.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px]">
          <button type="button" onClick={() => this.setState({ failed: false })}
            className="underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-[var(--accent)]">
            Retry list
          </button>
          <Link href="/dashboard/projects" className="underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-[var(--accent)]">
            Open projects
          </Link>
        </div>
      </div>
    );
  }
}
