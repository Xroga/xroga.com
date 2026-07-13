'use client';

import { useEffect } from 'react';
import { XrogaErrorPage, XrogaErrorActions } from '@/components/errors/XrogaErrorPage';
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
      <body style={{ margin: 0, background: '#030712' }}>
        <XrogaErrorPage
          code="System"
          title="Workspace session needs a refresh"
          description="A cached session conflict interrupted the app. Reset once to continue — your account and projects are safe."
          actions={
            <XrogaErrorActions
              primaryLabel="Reset & continue"
              onPrimary={() => {
                resetClientGlitchState();
                reset();
              }}
              secondaryLabel="Open workspace"
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
