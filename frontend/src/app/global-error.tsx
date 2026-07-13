'use client';

import { useEffect } from 'react';
import { XrogaErrorPage, XrogaErrorActions } from '@/components/errors/XrogaErrorPage';
import { resetClientGlitchState } from '@/lib/storageRecovery';
import '@/app/globals.css';
import '@/styles/xroga-system-error.css';

const ERROR_RECOVERY_KEY = 'xroga_error_recovery_attempted';

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[global-error]', error.message, error.stack);
  }, [error]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (sessionStorage.getItem(ERROR_RECOVERY_KEY)) return;
    sessionStorage.setItem(ERROR_RECOVERY_KEY, '1');
    resetClientGlitchState();
    window.location.replace('/workspace');
  }, []);

  function hardReset() {
    resetClientGlitchState();
    sessionStorage.removeItem(ERROR_RECOVERY_KEY);
    window.location.replace('/workspace');
  }

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:wght@700&family=Outfit:wght@400;600;700&family=Syne:wght@600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body style={{ margin: 0, background: '#030712' }}>
        <XrogaErrorPage
          code="System"
          title="Workspace session needs a refresh"
          description="A cached session conflict interrupted the app. Reset once to continue — your account and projects are safe."
          actions={
            <XrogaErrorActions
              primaryLabel="Reset & continue"
              onPrimary={hardReset}
              secondaryLabel="Open workspace"
              onSecondary={hardReset}
            />
          }
        />
      </body>
    </html>
  );
}
