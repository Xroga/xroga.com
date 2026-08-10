'use client';

import { useMemo } from 'react';
import { ChevronRight, Infinity } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { getTimeGreetingKey, t } from '@/lib/i18n/translations';
import { useLocale } from '@/components/providers/LanguageProvider';
import { FirstRunShipChecklist } from '@/components/dashboard/FirstRunShipChecklist';
import { WorkspaceShowcaseStarts } from '@/components/dashboard/WorkspaceShowcaseStarts';
import { claudeSerif, pixelCoding } from '@/lib/fonts';
import { cn } from '@/lib/utils';

interface DashboardWelcomeProps {
  displayName: string;
  hidden?: boolean;
  className?: string;
}

export function DashboardWelcome({ displayName, hidden, className }: DashboardWelcomeProps) {
  const profile = useAppStore((s) => s.profile);
  const locale = useLocale();
  const name = profile?.display_name ?? displayName;

  const greeting = useMemo(() => t(getTimeGreetingKey(), locale), [locale]);

  if (hidden) return null;

  return (
    <div
      className={cn('xv-dashboard-welcome xv-welcome-modern relative', className)}
      data-testid="workspace-welcome"
    >
      <div className="xv-welcome-hero relative mx-auto flex max-w-3xl flex-col items-center text-center">
        <p className="xv-welcome-greeting relative">
          <span className={cn('xv-welcome-greeting-text', claudeSerif.className)}>{greeting},</span>
        </p>
        <p className="xv-welcome-name-line relative">
          <span className={cn('xv-welcome-name', pixelCoding.className)}>{name}</span>
        </p>

        <div className="xv-blackhole-identity xv-blackhole-identity--compact relative" aria-label="Black Hole V Infinity">
          <span className="xv-blackhole-identity__label">BLACK HOLE</span>
          <span className="xv-blackhole-identity__mark">
            <span className="xv-blackhole-identity__v">V</span>
            <Infinity className="xv-blackhole-identity__inf" strokeWidth={2.75} aria-hidden />
          </span>
        </div>

        <div className="xv-welcome-taglines relative mt-3">
          <p className={cn('xv-welcome-tagline-sub', claudeSerif.className)}>
            The <span className="xv-tagline-accent">first</span> and{' '}
            <span className="xv-tagline-accent">last</span> model you will ever need.
          </p>
        </div>
      </div>

      <div className="relative mx-auto mt-4 max-w-3xl">
        <FirstRunShipChecklist className="mb-3" />
      </div>

      {/* Keep the useful starter templates compact. Recent sessions already live in
          Projects, so repeating them here pushed the actual terminal down and made
          stale/degraded work look like the workspace's primary state. */}
      <div className="relative mx-auto mt-3 max-w-3xl space-y-2">
        <details className="xv-ws-fold">
          <summary className="xv-ws-fold__summary">
            <ChevronRight className="xv-ws-fold__chev h-3.5 w-3.5" aria-hidden="true" />
            <span className="xv-ws-fold__label">Start from a Xroga build</span>
            <span className="xv-ws-fold__hint">Templates</span>
          </summary>
          <div className="xv-ws-fold__body">
            <WorkspaceShowcaseStarts />
          </div>
        </details>

      </div>
    </div>
  );
}
