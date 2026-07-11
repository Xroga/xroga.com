'use client';

import { useEffect } from 'react';
import { clearWorkspaceSession } from '@/lib/workspacePersistence';
import { RetroTvErrorPage, RetroTvErrorActions } from '@/components/errors/RetroTvErrorPage';

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
    <RetroTvErrorPage
      screenText="ERROR"
      overlayDigits={['E', 'R', 'R']}
      title="Something went wrong on the dashboard"
      description="This is usually a corrupted saved chat session. Reset the workspace, then try your build again."
      backHref={undefined}
      actions={
        <RetroTvErrorActions
          primaryLabel="Reset & try again"
          onPrimary={() => {
            clearWorkspaceSession();
            reset();
          }}
          secondaryLabel="Reload dashboard"
          onSecondary={() => window.location.assign('/dashboard')}
        />
      }
    />
  );
}
