'use client';

import { useEffect } from 'react';
import { RetroTvErrorPage, RetroTvErrorActions } from '@/components/errors/RetroTvErrorPage';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[global-error]', error.message, error.stack);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0 }}>
        <RetroTvErrorPage
          screenText="ERROR"
          overlayDigits={['E', 'R', 'R']}
          title="Xroga hit a display glitch"
          description="A saved session or browser cache mismatch caused a client error. Reload to continue — your account is safe."
          backHref={undefined}
          actions={
            <RetroTvErrorActions
              primaryLabel="Reset & retry"
              onPrimary={() => {
                try {
                  localStorage.removeItem('xroga_workspace_session');
                  sessionStorage.removeItem('xroga_workspace_session');
                } catch {
                  /* ignore */
                }
                reset();
              }}
              secondaryLabel="Reload workspace"
              onSecondary={() => window.location.assign('/dashboard')}
            />
          }
        />
      </body>
    </html>
  );
}
