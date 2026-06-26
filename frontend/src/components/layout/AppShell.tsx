'use client';

import { useState } from 'react';
import { Sidebar } from './Sidebar';
import { MobileNav } from './MobileNav';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { Logo } from './Logo';
import { HeaderActionMeter } from './HeaderActionMeter';
import { TopUpModal } from '@/components/billing/TopUpModal';

interface AppShellProps {
  children: React.ReactNode;
  displayName?: string;
}

export function AppShell({ children, displayName }: AppShellProps) {
  const [topUpOpen, setTopUpOpen] = useState(false);

  return (
    <div className="flex min-h-screen terminal-grid">
      <Sidebar displayName={displayName} onTopUp={() => setTopUpOpen(true)} />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-4 px-4 sm:px-6 py-3 border-b border-[var(--card-border)] glass-panel-strong">
          <div className="lg:hidden pl-10">
            <Logo href="/dashboard" size="sm" />
          </div>
          <div className="hidden lg:block" />
          <div className="flex items-center gap-3 ml-auto">
            <HeaderActionMeter onClick={() => setTopUpOpen(true)} />
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
