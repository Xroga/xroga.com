'use client';

import { useEffect } from 'react';
import { clearWorkspaceSession } from '@/lib/workspacePersistence';
import { resetClientGlitchState } from '@/lib/storageRecovery';
import { XrogaErrorPage, XrogaErrorActions } from '@/components/errors/XrogaErrorPage';

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
    <XrogaErrorPage
      code="Dashboard"
      title="Dashboard session needs a refresh"
      description="This is usually a corrupted saved chat session. Reset the workspace cache, then continue building."
      actions={
        <XrogaErrorActions
          primaryLabel="Reset & continue"
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
