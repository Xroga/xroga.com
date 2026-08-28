'use client';

import { useMemo } from 'react';
import { Infinity } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { getTimeGreetingKey, t } from '@/lib/i18n/translations';
import { useLocale } from '@/components/providers/LanguageProvider';
import { FirstRunShipChecklist } from '@/components/dashboard/FirstRunShipChecklist';
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
            One prompt. A product you can <span className="xv-tagline-accent">own</span>, evolve, and{' '}
            <span className="xv-tagline-accent">ship</span>.
          </p>
        </div>
      </div>

      <div className="relative mx-auto mt-4 max-w-3xl">
        <FirstRunShipChecklist className="mb-3" />
      </div>

    </div>
  );
}
