'use client';

import { FirstRunShipChecklist } from '@/components/dashboard/FirstRunShipChecklist';
import { emilio, goga } from '@/lib/fonts';
import { cn } from '@/lib/utils';
import { WorkspaceConnectionsStrip } from '@/components/terminal/WorkspaceConnectionsStrip';

interface DashboardWelcomeProps {
  hidden?: boolean;
  className?: string;
  composer?: boolean;
}


/* ============================================================
   SMALL IDENTITY ABOVE THE REAL COMPOSER

   X  Hi Alex
      Turn an idea into something live.
   ============================================================ */

export function WorkspaceComposerKicker({
  displayName,
}: {
  displayName: string;
}) {
  const shortName = displayName.trim().split(/\s+/)[0]?.slice(0, 12) || 'builder';

  return (
    <div
      className={cn(
        'xv-welcome-composer-kicker',
        'xv-welcome-composer-kicker-v2',
        goga.className,
      )}
      aria-label={`Hi ${shortName}. Turn an idea into something live.`}
    >
      <div className="xv-welcome-composer-hello">
        <span
          className={cn(
            'xv-welcome-composer-mark',
            emilio.className,
          )}
          aria-hidden="true"
        >
          X
        </span>

        <span className="xv-welcome-composer-hello-copy">
          <span>Hi</span>

          <b>{shortName}</b>
        </span>
      </div>

      <strong>Turn an idea into something live.</strong>

      {/*
       * Keep this existing hook in the DOM contract.
       * It is visually hidden because the username now lives
       * beside "Hi", but existing workspace tests/selectors
       * can continue finding it.
       */}
      <span
        className="xv-welcome-short-name"
        aria-label={`Signed in as ${shortName}`}
        aria-hidden="true"
      >
        {shortName}
      </span>
    </div>
  );
}


/* ============================================================
   EMPTY WORKSPACE CENTER IDENTITY

   Describe it. Build it. Ship it.
   ============================================================ */

export function DashboardWelcome({
  hidden,
  className,
  composer = false,
}: DashboardWelcomeProps) {
  if (hidden) return null;

  return (
    <div
      className={cn(
        'xv-dashboard-welcome',
        'xv-welcome-modern',
        'relative',

        composer &&
          'xv-dashboard-welcome--composer',

        className,
      )}
      data-testid="workspace-welcome"
    >
      {composer ? <WorkspaceConnectionsStrip href="/dashboard/integrations" interactive /> : null}

      <div
        className="
          xv-welcome-hero
          relative
          mx-auto
          flex
          max-w-3xl
          flex-col
          items-center
          text-center
        "
      >
        <h1
          className={cn(
            'xv-welcome-editorial',
            'xv-welcome-editorial-v2',
            goga.className,
          )}
        >
          <span className="xv-welcome-editorial__primary">
            Describe it.
          </span>

          <span className="xv-welcome-editorial__build">
            Build it.
          </span>

          <span className="xv-welcome-editorial__primary">
            Ship it.
          </span>
        </h1>
      </div>

      {!composer ? (
        <div className="relative mx-auto mt-4 max-w-3xl">
          <FirstRunShipChecklist className="mb-3" />
        </div>
      ) : null}
    </div>
  );
}
