'use client';

import { useEffect } from 'react';
import { clearWorkspaceSession } from '@/lib/workspacePersistence';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[dashboard/error]', error.message);
  }, [error]);

  return (
    <div className="max-w-lg mx-auto mt-16 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-6 text-center space-y-4">
      <h2 className="text-lg font-semibold">Something went wrong on the dashboard</h2>
      <p className="text-sm text-[var(--muted)] leading-relaxed">
        This is usually a corrupted saved chat session. Reset the workspace, then try your build again.
      </p>
      <div className="flex flex-wrap gap-2 justify-center">
        <button
          type="button"
          onClick={() => {
            clearWorkspaceSession();
            reset();
          }}
          className="px-4 py-2 rounded-lg bg-[#006aff] text-white text-sm font-semibold"
        >
          Reset &amp; try again
        </button>
        <button
          type="button"
          onClick={() => window.location.assign('/dashboard')}
          className="px-4 py-2 rounded-lg border border-[var(--card-border)] text-sm"
        >
          Reload dashboard
        </button>
      </div>
    </div>
  );
}
