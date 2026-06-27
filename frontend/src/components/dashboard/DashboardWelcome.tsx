'use client';

import { useMemo } from 'react';
import { Sparkles } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { getTimeGreetingKey, t } from '@/lib/i18n/translations';
import { useLocale } from '@/components/providers/LanguageProvider';
import { RotatingWords } from '@/components/ui/RotatingWords';
import { ModelBadge } from '@/components/ui/ModelBadge';
import { XROGA_MODEL_TAGLINE, XROGA_AI_GENIUS } from '@/lib/brand';
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
    <div className={cn('xv-dashboard-welcome space-y-2.5 mb-2', className)}>
      <div className="flex flex-wrap items-center gap-2">
        <Sparkles className="w-4 h-4 text-[var(--accent)] shrink-0" />
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
            {greeting}, <span className="gradient-text">{firstName}</span>
          </h1>
          <p className="text-[10px] sm:text-xs text-[var(--accent)] font-medium mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="opacity-80">{XROGA_AI_GENIUS}</span>
            <span className="opacity-40">·</span>
            <ModelBadge variant="inline" className="text-[10px] sm:text-xs" />
            <span className="opacity-40">·</span>
            <span>{XROGA_MODEL_TAGLINE}</span>
          </p>
        </div>
      </div>
      <div className="xv-dashboard-subhead pl-6 border-l-2 border-[var(--accent)]/30">
        <RotatingWords
          prefix="Ship"
          words={DASHBOARD_ROTATE_WORDS}
          variant="dashboard"
          className="text-sm sm:text-base"
          stopAfterMs={18000}
        />
      </div>
    </div>
  );
}
