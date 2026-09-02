'use client';

import { FirstRunShipChecklist } from '@/components/dashboard/FirstRunShipChecklist';
import { claudeSerif, goga } from '@/lib/fonts';
import { cn } from '@/lib/utils';
import { WorkspaceConnectionsStrip } from '@/components/terminal/WorkspaceConnectionsStrip';

interface DashboardWelcomeProps {
  hidden?: boolean;
  className?: string;
  composer?: boolean;
}

export function WorkspaceComposerKicker({ displayName }: { displayName: string }) {
  const shortName = displayName.trim().split(/\s+/)[0]?.slice(0, 12) || 'builder';

  return (
    <p className={cn('xv-welcome-composer-kicker', goga.className)}>
      <strong>Turn an idea into something live.</strong>
      <span className="xv-welcome-short-name" aria-label={`Signed in as ${shortName}`}>{shortName}</span>
    </p>
  );
}

export function DashboardWelcome({ hidden, className, composer = false }: DashboardWelcomeProps) {

  if (hidden) return null;

  return (
    <div
      className={cn(
        'xv-dashboard-welcome xv-welcome-modern relative',
        composer && 'xv-dashboard-welcome--composer',
        className,
      )}
      data-testid="workspace-welcome"
    >
      <div className="xv-welcome-hero relative mx-auto flex max-w-3xl flex-col items-center text-center">
        <h1 className={cn('xv-welcome-editorial', goga.className)}>
          <span>Describe it.</span>
          <span className="xv-welcome-editorial__build">Build it.</span>
          <em className={claudeSerif.className}>Ship it.</em>
        </h1>
      </div>

      {composer ? <WorkspaceConnectionsStrip href="/dashboard/integrations" /> : null}

      {!composer ? (
        <div className="relative mx-auto mt-4 max-w-3xl">
          <FirstRunShipChecklist className="mb-3" />
        </div>
      ) : null}

    </div>
  );
}
