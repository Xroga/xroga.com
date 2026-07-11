'use client';

import { useMemo } from 'react';
import { Infinity } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { getTimeGreetingKey, t } from '@/lib/i18n/translations';
import { useLocale } from '@/components/providers/LanguageProvider';
import { RotatingWords } from '@/components/ui/RotatingWords';
import { XROGA_BRAND, XROGA_MODEL_NAME, XROGA_MODEL_VERSION } from '@/lib/brand';
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
    <section className={cn('xv-welcome-hero mb-3 relative', className)}>
      <div className="xv-welcome-hero__mesh" aria-hidden />

      <div className="relative z-[1] space-y-2">
        <p className="xv-welcome-hero__greeting">
          {greeting},{' '}
          <span className="text-white/80 font-medium">{firstName}</span>
        </p>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h1 className="xv-welcome-hero__brand">{XROGA_BRAND}</h1>
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-white/50 px-2 py-0.5 rounded-full border border-white/10 bg-white/[0.04]">
            {XROGA_MODEL_NAME}
            <span className="text-[#4a7aff] inline-flex items-center">
              {XROGA_MODEL_VERSION.replace('∞', '')}
              <Infinity className="w-3 h-3 ml-0.5" strokeWidth={2.5} />
            </span>
          </span>
        </div>

        <p className="xv-welcome-hero__tag hidden sm:block">
          Others count up. We count forever. · The first and last model you will ever need.
        </p>

        <div className="xv-welcome-ship-pill">
          <RotatingWords
            prefix="Ship"
            words={DASHBOARD_ROTATE_WORDS}
            variant="dashboard"
            className="xv-welcome-ship-pill__inner min-w-0"
            stopAfterMs={22000}
          />
        </div>
      </div>
    </section>
  );
}
