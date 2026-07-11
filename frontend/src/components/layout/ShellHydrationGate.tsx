'use client';

import { useHydrated } from '@/hooks/useHydrated';

/** Renders children only after client mount — prevents Zustand persist hydration crashes. */
export function ShellHydrationGate({
  children,
  fallback,
}: {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const hydrated = useHydrated();
  if (!hydrated) {
    return (
      fallback ?? (
        <div className="flex min-h-screen terminal-layout overflow-x-hidden" style={{ '--sidebar-width': '256px' } as React.CSSProperties}>
          <div className="hidden lg:block w-64 shrink-0 border-r border-[var(--card-border)]/30 bg-[var(--card)]/20" aria-hidden />
          <div className="flex-1 flex flex-col min-w-0">
            <div className="h-14 sm:h-16 border-b border-[var(--card-border)]/20 shrink-0" aria-hidden />
            <div className="flex-1 p-4 sm:p-6 animate-pulse">
              <div className="h-8 w-48 rounded-lg bg-white/5 mb-4" />
              <div className="h-32 rounded-2xl bg-white/5" />
            </div>
          </div>
        </div>
      )
    );
  }
  return <>{children}</>;
}
