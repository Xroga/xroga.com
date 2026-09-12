'use client';

import { FirstRunShipChecklist } from '@/components/dashboard/FirstRunShipChecklist';
import { goga } from '@/lib/fonts';
import { cn } from '@/lib/utils';
import { WorkspaceConnectionsStrip } from '@/components/terminal/WorkspaceConnectionsStrip';

interface DashboardWelcomeProps {
  hidden?: boolean;
  className?: string;
  composer?: boolean;
}


/* ============================================================
   COMPOSER GREETING
   ------------------------------------------------------------
   Hi Alex
   Turn an idea into something live.
   ============================================================ */

export function WorkspaceComposerKicker({
  displayName,
}: {
  displayName: string;
}) {
  const shortName =
    displayName
      .trim()
      .split(/\s+/)[0]
      ?.slice(0, 12) || 'builder';

  return (
    <div
      className={cn(
        'xv-welcome-composer-kicker',
        goga.className,
      )}
      aria-label={`Hi ${shortName}. Turn an idea into something live.`}
    >
      <div className="xv-welcome-composer-hello">
        <span className="xv-welcome-composer-hi">
          Hi
        </span>

        <b className="xv-welcome-composer-user">
          {shortName}
        </b>
      </div>

      <strong>Turn an idea into something live.</strong>

      {/*
       * Keep this hook for compatibility with the existing
       * workspace tests/accessibility contract.
       *
       * The visible username is now rendered above.
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
   EMPTY WORKSPACE IDENTITY
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
        'xv-dashboard-welcome xv-welcome-modern relative',
        composer &&
          'xv-dashboard-welcome--composer',
        className,
      )}
      data-testid="workspace-welcome"
    >
      {/* =====================================================
          MAIN CENTERED HEADLINE
          ===================================================== */}

      <div className="xv-welcome-hero relative mx-auto flex max-w-3xl flex-col items-center text-center">
        <h1 className={cn('xv-welcome-editorial', goga.className)}>
          <span>Describe it.</span>

          <span className="xv-welcome-editorial__build">
            Build it.
          </span>

          <span>
            Ship it.
          </span>
        </h1>

        {composer ? (
          <p className="xv-welcome-capabilities">
            Create, explore, search, research, learn, plan, build,
            debug, and ship live.
          </p>
        ) : null}
      </div>


      {/* =====================================================
          INTEGRATIONS — BELOW HEADLINE
          ===================================================== */}

      {composer ? <WorkspaceConnectionsStrip href="/dashboard/integrations" interactive /> : null}


      {/* =====================================================
          NON-COMPOSER DASHBOARD CONTENT
          ===================================================== */}

      {!composer ? (
        <div className="relative mx-auto mt-4 max-w-3xl">
          <FirstRunShipChecklist className="mb-3" />
        </div>
      ) : null}
    </div>
  );
}
