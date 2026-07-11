'use client';

import { useMemo } from 'react';
import { Sparkles } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { getTimeGreetingKey, t } from '@/lib/i18n/translations';
import { useLocale } from '@/components/providers/LanguageProvider';
import { RotatingWords } from '@/components/ui/RotatingWords';
import { ModelBadge } from '@/components/ui/ModelBadge';
import { XROGA_MODEL_TAGLINE, XROGA_MODEL_FIRST_LAST } from '@/lib/brand';
import { cn } from '@/lib/utils';

const DASHBOARD_ROTATE_WORDS = [
  'something legendary',
  'your next app',
  'browser automations',
  'swarm projects',
  'live deployments',
  'games & movies',
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
    <div className={cn('xv-dashboard-welcome space-y-2.5 mb-2 relative', className)}>
      <div className="xv-ai-live-ring pointer-events-none absolute -left-2 top-0 w-12 h-12 rounded-full opacity-60" aria-hidden />
      <div className="flex flex-wrap items-center gap-2 relative">
        <Sparkles className="w-4 h-4 text-[var(--accent)] shrink-0" />
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
            {greeting}, <span className="gradient-text">{firstName}</span>
          </h1>
          <p className="text-[10px] sm:text-xs text-[var(--accent)] font-medium mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 max-w-full">
            <ModelBadge variant="inline" className="text-[10px] sm:text-xs shrink-0" />
            <span className="opacity-40 hidden sm:inline">·</span>
            <span className="hidden sm:inline truncate">{XROGA_MODEL_TAGLINE}</span>
            <span className="opacity-40 hidden md:inline">·</span>
            <span className="hidden md:inline opacity-80">{XROGA_MODEL_FIRST_LAST}</span>
          </p>
        </div>
      </div>
      <div className="xv-dashboard-subhead pl-4 sm:pl-6 border-l-2 border-[var(--accent)]/30 max-w-full overflow-hidden">
        <RotatingWords
          prefix="Ship"
          words={DASHBOARD_ROTATE_WORDS}
          variant="dashboard"
          className="text-xs sm:text-base max-w-full"
          stopAfterMs={18000}
        />
      </div>
    </div>
  );
}
