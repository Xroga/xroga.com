'use client';

import { useMemo } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { getTimeGreetingKey, t } from '@/lib/i18n/translations';
import { useLocale } from '@/components/providers/LanguageProvider';
import { RotatingWords } from '@/components/ui/RotatingWords';
import { WorkspaceResumeList } from '@/components/dashboard/WorkspaceResumeList';
import { XROGA_MODEL_TAGLINE, XROGA_MODEL_FIRST_LAST, XROGA_BRAND, XROGA_MODEL_NAME } from '@/lib/brand';
import { cn } from '@/lib/utils';

const FEATURE_ROTATE_WORDS = [
  'GitHub → Vercel deploys',
  'multi-agent Swarm builds',
  'browser automation',
  'safe web research',
  'image & video AI',
  '710+ integrations',
  'repo-scoped terminals',
  'live code fixes',
  'games & SaaS apps',
  'something legendary',
];

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
      <div className="xv-welcome-grid-overlay pointer-events-none absolute inset-0 rounded-2xl opacity-40" aria-hidden />

      <p className="xv-welcome-greeting relative">
        {greeting},{' '}
        <span className="xv-welcome-name">{firstName}</span>
      </p>

      <div className="xv-welcome-brand-row relative flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="xv-welcome-xroga">{XROGA_BRAND}</span>
        <span className="xv-welcome-blackhole">{XROGA_MODEL_NAME}</span>
        <span className="xv-welcome-v" title="Version Infinity">
          V∞
        </span>
      </div>

      <p className="xv-welcome-taglines relative flex flex-wrap items-center gap-x-2 gap-y-1">
        <span>{XROGA_MODEL_TAGLINE}</span>
        <span className="opacity-35 hidden sm:inline">·</span>
        <span className="opacity-90">{XROGA_MODEL_FIRST_LAST}</span>
      </p>

      <div className="xv-welcome-ship relative mt-3 sm:mt-4 max-w-full overflow-hidden">
        <RotatingWords
          prefix="Ship"
          words={FEATURE_ROTATE_WORDS}
          variant="dashboard"
          className="xv-welcome-rotate text-base sm:text-xl lg:text-2xl max-w-full"
        />
      </div>

      <WorkspaceResumeList className="relative" />
    </div>
  );
}
