'use client';

import { useMemo } from 'react';
import { Infinity } from 'lucide-react';
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

  const greeting = useMemo(() => t(getTimeGreetingKey(), locale), [locale]);

  if (hidden) return null;

  return (
    <div className={cn('xv-dashboard-welcome xv-welcome-modern relative', className)}>
      <p className="xv-welcome-greeting relative font-goga">
        <span className="xv-welcome-greeting-text">{greeting},</span>{' '}
        <span className="xv-welcome-name font-remixa">{name}</span>
      </p>

      <p className="xv-welcome-blackhole relative font-azurio" aria-label="Black Hole V Infinity">
        <span className="xv-welcome-blackhole-label">Black Hole</span>
        <span className="xv-welcome-blackhole-v">
          V
          <Infinity className="inline w-[0.85em] h-[0.85em] -mt-px" strokeWidth={2.5} aria-hidden />
        </span>
      </p>

      <p className="xv-welcome-tagline-mixed relative font-goga">
        Others count up.{' '}
        <span className="xv-tagline-accent font-emilio">We count forever.</span>
      </p>
      <p className="xv-welcome-tagline-sub relative font-goga">
        The <span className="xv-tagline-accent font-emilio">first</span> and{' '}
        <span className="xv-tagline-accent font-emilio">last</span> model you will ever need.
      </p>

      <WorkspaceResumeList className="relative" />
    </div>
  );
}
