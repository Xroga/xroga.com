'use client';

import { useMemo } from 'react';
import { Sparkles } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { getInspiringLine } from '@/lib/greetings';
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
  const line = useMemo(() => getInspiringLine(name), [name]);

  if (hidden) return null;

  return (
    <div className={cn('xv-dashboard-welcome space-y-1 mb-2', className)}>
      <div className="flex flex-wrap items-center gap-2">
        <Sparkles className="w-4 h-4 text-[var(--accent)] shrink-0" />
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
          {greeting}, <span className="gradient-text">{firstName}</span>
        </h1>
      </div>
      <p className="text-sm text-[var(--muted)] max-w-2xl leading-relaxed pl-6">{line}</p>
    </div>
  );
}
