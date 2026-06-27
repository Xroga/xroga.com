'use client';

import { useState } from 'react';
import { Sidebar } from './Sidebar';
import { MobileNav } from './MobileNav';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { Logo } from './Logo';
import { HeaderActionMeter } from './HeaderActionMeter';
import { ThemeToggle } from './ThemeToggle';
import { TopUpModal } from '@/components/billing/TopUpModal';
import { TerminalDock } from '@/components/terminal/TerminalDock';
import { TerminalChatProvider } from '@/context/TerminalChatContext';
import { useThemeStore } from '@/store/useThemeStore';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

interface AppShellProps {
  children: React.ReactNode;
  displayName?: string;
  email?: string;
}

export function AppShell({ children, displayName, email }: AppShellProps) {
  const [topUpOpen, setTopUpOpen] = useState(false);
  const sidebarOpen = useThemeStore((s) => s.sidebarOpen);
  const theme = useThemeStore((s) => s.theme);
  const pathname = usePathname();
  const isDashboard = pathname === '/dashboard';

  return (
    <TerminalChatProvider>
      <div
        className="flex min-h-screen terminal-layout"
        style={{ '--sidebar-width': sidebarOpen ? '16rem' : '4.5rem' } as React.CSSProperties}
      >
        <Sidebar displayName={displayName} email={email} onTopUp={() => setTopUpOpen(true)} />
        <div className="flex-1 flex flex-col min-w-0 min-h-screen">
          <header
            className={cn(
              'sticky top-0 z-30 flex items-center justify-between gap-4 px-4 sm:px-6 py-3 shrink-0 transition-all',
              theme === 'image'
                ? 'bg-transparent border-b border-transparent'
                : 'border-b border-[var(--card-border)] glass-panel-strong'
            )}
          >
            <div className="xv-mobile-header-logo flex items-center gap-4 pl-12 lg:pl-0 lg:hidden">
              <Logo href="/dashboard" height={40} variant="header" />
            </div>
            <div className="flex items-center gap-2 sm:gap-3 ml-auto">
              <HeaderActionMeter onClick={() => setTopUpOpen(true)} />
              <ThemeToggle />
              <NotificationBell />
            </div>
          </header>
          <main
            className={cn(
              'flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8',
              'pb-24 lg:pb-8',
              isDashboard && 'pb-[210px] lg:pb-[180px]'
            )}
          >
            {children}
          </main>
          <TerminalDock />
        </div>
        <MobileNav />
        <TopUpModal open={topUpOpen} onClose={() => setTopUpOpen(false)} />
      </div>
    </TerminalChatProvider>
  );
}
