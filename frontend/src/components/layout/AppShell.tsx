'use client';

import { useEffect, useState } from 'react';
import { Sidebar } from './Sidebar';
import { MobileNav } from './MobileNav';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { Logo } from './Logo';
import { HeaderActionMeter } from './HeaderActionMeter';
import { AppStoreInline } from '@/components/ui/AppStoreInline';
import { ThemeToggle } from './ThemeToggle';
import { TopUpModal } from '@/components/billing/TopUpModal';
import { TerminalDock } from '@/components/terminal/TerminalDock';
import { TerminalChatProvider } from '@/context/TerminalChatContext';
import { TerminalScrollProvider } from '@/context/TerminalScrollContext';
import { useThemeStore } from '@/store/useThemeStore';
import { usePathname } from 'next/navigation';
import { IncognitoModeButton } from '@/components/layout/IncognitoModeButton';
import { IncognitoFullscreenBackground } from '@/components/incognito/IncognitoFullscreenBackground';
import { usePrivacyStore } from '@/store/usePrivacyStore';
import { useHydrated } from '@/hooks/useHydrated';
import { ShellHydrationGate } from '@/components/layout/ShellHydrationGate';
import { cn } from '@/lib/utils';

interface AppShellProps {
  children: React.ReactNode;
  displayName?: string;
  email?: string;
}

export function AppShell({ children, displayName, email }: AppShellProps) {
  const [topUpOpen, setTopUpOpen] = useState(false);
  const hydrated = useHydrated();
  const sidebarOpen = useThemeStore((s) => s.sidebarOpen);
  const sidebarWidth = useThemeStore((s) => s.sidebarWidth);
  const pathname = usePathname();
  const isDashboard = pathname === '/dashboard';
  const incognitoRaw = usePrivacyStore((s) => s.incognito);
  const incognito = hydrated && incognitoRaw;
  const effectiveSidebarOpen = hydrated ? sidebarOpen : true;
  const widthPx = effectiveSidebarOpen ? (hydrated ? sidebarWidth : 256) : 72;

  useEffect(() => {
    document.body.classList.toggle('xv-incognito-active', incognito && isDashboard);
    return () => document.body.classList.remove('xv-incognito-active');
  }, [incognito, isDashboard]);

  return (
    <ShellHydrationGate>
    <TerminalChatProvider>
      <TerminalScrollProvider>
      <IncognitoFullscreenBackground />
      <div
        className="flex min-h-screen terminal-layout overflow-x-hidden"
        style={{ '--sidebar-width': `${widthPx}px` } as React.CSSProperties}
      >
        <Sidebar displayName={displayName} email={email} onTopUp={() => setTopUpOpen(true)} />
        <div className="xv-main-column flex-1 flex flex-col w-full min-w-0 max-w-full min-h-screen overflow-x-hidden relative z-[2]">
          <header className="xv-site-header xv-site-header-transparent sticky top-0 z-30 flex items-center justify-between gap-2 sm:gap-4 px-3 sm:px-6 py-2 sm:py-3 shrink-0">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <div
                className={cn(
                  'xv-mobile-header-logo min-w-0',
                  incognito && isDashboard ? 'pl-0 lg:pl-0' : 'pl-11 sm:pl-12 lg:pl-0'
                )}
              >
                <Logo href="/dashboard/home" height={52} variant="header" className="!h-[52px] sm:!h-[68px] lg:!h-[72px]" />
              </div>
            </div>
            <div className="flex items-center gap-1.5 sm:gap-3 ml-auto shrink-0 relative z-[250]">
              {isDashboard && <IncognitoModeButton />}
              {!incognito && (
                <>
                  <AppStoreInline compact className="hidden md:inline-flex opacity-80" />
                  <HeaderActionMeter onClick={() => setTopUpOpen(true)} className="!px-2 sm:!px-3 !py-1 sm:!py-1.5 text-xs sm:text-sm" />
                </>
              )}
              <ThemeToggle />
              {!incognito && <NotificationBell />}
            </div>
          </header>

          <main
            className={cn(
              'flex-1 overflow-y-auto overflow-x-hidden relative z-[1]',
              incognito && isDashboard ? 'p-2 sm:p-4 lg:p-6 bg-transparent' : 'p-3 sm:p-6 lg:p-8',
              'pb-24 lg:pb-8',
              isDashboard && 'pb-[min(260px,calc(38vh+env(safe-area-inset-bottom)))] lg:pb-[240px]'
            )}
          >
            {children}
          </main>
          <TerminalDock />
        </div>
        <MobileNav />
        <TopUpModal open={topUpOpen} onClose={() => setTopUpOpen(false)} />
      </div>
      </TerminalScrollProvider>
    </TerminalChatProvider>
    </ShellHydrationGate>
  );
}
