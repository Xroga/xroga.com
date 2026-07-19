'use client';

import { useMemo } from 'react';
import { Infinity } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { getTimeGreetingKey, t } from '@/lib/i18n/translations';
import { useLocale } from '@/components/providers/LanguageProvider';
import { WorkspaceResumeList } from '@/components/dashboard/WorkspaceResumeList';
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
    <div className={cn('xv-dashboard-welcome xv-welcome-modern relative', className)}>
      <p className="xv-welcome-greeting relative">
        <span className={cn('xv-welcome-greeting-text', claudeSerif.className)}>{greeting},</span>
      </p>
      <p className="xv-welcome-name-line relative">
        <span className={cn('xv-welcome-name', pixelCoding.className)}>{name}</span>
      </p>

      <div className="xv-blackhole-identity relative" aria-label="Black Hole V Infinity">
        <span className="xv-blackhole-identity__label">BLACK HOLE</span>
        <span className="xv-blackhole-identity__mark">
          <span className="xv-blackhole-identity__v">V</span>
          <Infinity className="xv-blackhole-identity__inf" strokeWidth={2.75} aria-hidden />
        </span>
      </div>

      <div className="xv-welcome-taglines relative mt-3 space-y-2 max-w-3xl">
        {/*
          Anthropic Serif is proprietary — Newsreader (claudeSerif.className) is the open stand-in.
          Applying next/font className directly so body Outfit/sans cannot override it.
        */}
        <p className={cn('xv-welcome-tagline-sub', claudeSerif.className)}>
          The <span className="xv-tagline-accent">first</span> and{' '}
          <span className="xv-tagline-accent">last</span> model you will ever need.
        </p>
      </div>

      <WorkspaceResumeList className="relative mt-4" />
    </div>
  );
}
