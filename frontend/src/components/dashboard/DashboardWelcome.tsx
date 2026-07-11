'use client';

import { useMemo } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { getTimeGreetingKey, t } from '@/lib/i18n/translations';
import { useLocale } from '@/components/providers/LanguageProvider';
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
    <div className={cn('xv-welcome-minimal mb-3', className)}>
      <p className="text-lg sm:text-xl font-semibold text-[var(--foreground)] tracking-tight">
        {greeting},{' '}
        <span className="text-[var(--accent)]">{firstName}</span>
      </p>
    </div>
  );
}
