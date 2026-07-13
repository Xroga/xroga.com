'use client';

import { useEffect } from 'react';
import { RetroTvErrorPage, RetroTvErrorActions } from '@/components/errors/RetroTvErrorPage';
import { resetClientGlitchState } from '@/lib/storageRecovery';

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
                resetClientGlitchState();
                reset();
              }}
              secondaryLabel="Reload workspace"
              onSecondary={() => {
                resetClientGlitchState();
                window.location.assign('/workspace');
              }}
            />
          }
        />
      </body>
    </html>
  );
}
