'use client';

import { useEffect } from 'react';
import { clearWorkspaceSession } from '@/lib/workspacePersistence';
import { resetClientGlitchState } from '@/lib/storageRecovery';
import { XrogaErrorPage, XrogaErrorActions } from '@/components/errors/XrogaErrorPage';

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
    <XrogaErrorPage
      code="Shell"
      title="Something interrupted your session"
      description="A display or saved-session conflict stopped the app. Reset the workspace cache and reload — your account is safe."
      actions={
        <XrogaErrorActions
          primaryLabel="Reset workspace"
          onPrimary={() => {
            resetClientGlitchState();
            clearWorkspaceSession();
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
  );
}
