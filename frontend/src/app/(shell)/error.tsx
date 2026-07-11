'use client';

import { useEffect } from 'react';
import { clearWorkspaceSession } from '@/lib/workspacePersistence';
import { RetroTvErrorPage, RetroTvErrorActions } from '@/components/errors/RetroTvErrorPage';

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
    <RetroTvErrorPage
      screenText="ERROR"
      overlayDigits={['E', 'R', 'R']}
      title="Something went wrong"
      description="A display or saved-session glitch interrupted the app. Your account is safe — reset the workspace session and reload."
      backHref={undefined}
      actions={
        <RetroTvErrorActions
          primaryLabel="Reset workspace & retry"
          onPrimary={() => {
            clearWorkspaceSession();
            reset();
          }}
          secondaryLabel="Reload workspace"
          onSecondary={() => window.location.assign('/dashboard')}
        />
      }
    />
  );
}
