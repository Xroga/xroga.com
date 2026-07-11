'use client';

import { useEffect } from 'react';
import { clearWorkspaceSession } from '@/lib/workspacePersistence';

export default function ShellError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[shell/error]', error.message, error.stack);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="max-w-lg w-full rounded-2xl border border-amber-500/30 bg-amber-500/10 p-6 text-center space-y-4">
        <h2 className="text-lg font-semibold">Something went wrong</h2>
        <p className="text-sm text-[var(--muted)] leading-relaxed">
          A display or saved-session glitch interrupted the app. Your account is safe — reset the workspace session and reload.
        </p>
        <div className="flex flex-wrap gap-2 justify-center">
          <button
            type="button"
            onClick={() => {
              clearWorkspaceSession();
              reset();
            }}
            className="px-4 py-2 rounded-lg bg-[#006aff] text-white text-sm font-semibold hover:bg-[#0056cc] transition-colors"
          >
            Reset workspace &amp; retry
          </button>
          <button
            type="button"
            onClick={() => window.location.assign('/dashboard')}
            className="px-4 py-2 rounded-lg border border-[var(--card-border)] text-sm hover:border-[var(--accent)]/40 transition-colors"
          >
            Reload workspace
          </button>
        </div>
      </div>
    </div>
  );
}
