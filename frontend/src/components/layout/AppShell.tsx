'use client';

import { useState } from 'react';
import { Sidebar } from './Sidebar';
import { MobileNav } from './MobileNav';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { Logo } from './Logo';
import { HeaderActionMeter } from './HeaderActionMeter';
import { ThemeToggle } from './ThemeToggle';
import { TopUpModal } from '@/components/billing/TopUpModal';
import { useThemeStore } from '@/store/useThemeStore';
import { cn } from '@/lib/utils';

interface AppShellProps {
  children: React.ReactNode;
  displayName?: string;
  email?: string;
}

export function AppShell({ children, displayName, email }: AppShellProps) {
  const [topUpOpen, setTopUpOpen] = useState(false);
  const sidebarOpen = useThemeStore((s) => s.sidebarOpen);

  return (
    <div className="flex min-h-screen">
      <Sidebar displayName={displayName} email={email} onTopUp={() => setTopUpOpen(true)} />
      <div
        className={cn(
          'flex-1 flex flex-col min-w-0 transition-all duration-300',
          sidebarOpen ? 'lg:ml-0' : 'lg:ml-0'
        )}
      >
        <header className="sticky top-0 z-30 flex items-center justify-between gap-4 px-4 sm:px-6 py-3 border-b border-[var(--card-border)] glass-panel-strong">
          <div className="flex items-center gap-4">
            <div className="lg:hidden pl-10">
              <Logo href="/dashboard" height={40} />
            </div>
            <div className="hidden lg:block">
              <Logo href="/dashboard" height={50} />
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 ml-auto">
            <HeaderActionMeter onClick={() => setTopUpOpen(true)} />
            <ThemeToggle />
            <NotificationBell />
          </div>
        </header>
        <main className="flex-1 p-4 sm:p-6 lg:p-8 pb-24 lg:pb-8 overflow-auto">{children}</main>
      </div>
      <MobileNav />
      <TopUpModal open={topUpOpen} onClose={() => setTopUpOpen(false)} />
    </div>
  );
}
