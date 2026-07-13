'use client';

import { useMemo } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { getTimeGreetingKey, t } from '@/lib/i18n/translations';
import { useLocale } from '@/components/providers/LanguageProvider';
import { WorkspaceResumeList } from '@/components/dashboard/WorkspaceResumeList';
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
  const firstName = name.split(/\s+/)[0] ?? name;

  const greeting = useMemo(() => t(getTimeGreetingKey(), locale), [locale]);

  if (hidden) return null;

  return (
    <div className={cn('xv-dashboard-welcome xv-welcome-modern relative', className)}>
      <div className="xv-welcome-grid-overlay pointer-events-none absolute inset-0 rounded-2xl opacity-35" aria-hidden />

      <p className="xv-welcome-greeting relative">
        {greeting},{' '}
        <span className="xv-welcome-name">{firstName}</span>
      </p>

      <div className="xv-welcome-vmark relative" aria-label="Version Infinity">
        <span className="xv-vmark-v">V</span>
        <span className="xv-vmark-infinity">∞</span>
      </div>

      <p className="xv-welcome-tagline-mixed relative">
        Others count up.{' '}
        <span className="xv-tagline-accent">We count forever.</span>
      </p>
      <p className="xv-welcome-tagline-sub relative">
        The <span className="xv-tagline-accent">first</span> and{' '}
        <span className="xv-tagline-accent">last</span> model you will ever need.
      </p>

      <WorkspaceResumeList className="relative" />
    </div>
  );
}
