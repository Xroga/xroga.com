'use client';

import { useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { MobileNav } from './MobileNav';
import { Logo } from './Logo';
import { ThemeToggle } from './ThemeToggle';
import { TerminalDock } from '@/components/terminal/TerminalDock';
import { TerminalChatProvider } from '@/context/TerminalChatContext';
import { TerminalScrollProvider } from '@/context/TerminalScrollContext';
import { useThemeStore } from '@/store/useThemeStore';
import { usePathname } from 'next/navigation';
import { IncognitoFullscreenBackground } from '@/components/incognito/IncognitoFullscreenBackground';
import { usePrivacyStore } from '@/store/usePrivacyStore';
import { useHydrated } from '@/hooks/useHydrated';
import { cn } from '@/lib/utils';
import { normalizeTheme, skinForTheme } from '@/lib/theme';
import { ShellIdentityProvider } from '@/components/layout/ShellIdentityContext';
import { WorkspacePerformanceProbe } from '@/components/layout/WorkspacePerformanceProbe';

interface AppShellProps {
  children: React.ReactNode;
  displayName?: string;
  email?: string;
}

/**
 * The brand in the page header, on small screens only.
 *
 * From `lg` up the sidebar is on screen and carries the mark itself, so this was a
 * second Xroga logo a few hundred pixels from the first — one inside the sidebar and
 * one loose in the header.
 *
 * Hidden rather than deleted, because below `lg` the sidebar is a drawer and this is
 * the only branding on the page; removing it outright would leave the mobile header as
 * a bare hamburger.
 */
function HeaderLogo() {
  const pathname = usePathname();
  const logoHref = pathname.startsWith('/dashboard') ? '/dashboard' : '/workspace';
  return (
    <div className={cn('xv-mobile-header-logo min-w-0 lg:hidden', 'pl-11 sm:pl-12')}>
      <Logo
        href={logoHref}
        height={52}
        variant="header"
        className="!h-[52px] sm:!h-[68px]"
      />
    </div>
  );
}

export function AppShell({ children, displayName, email }: AppShellProps) {
  const hydrated = useHydrated();
  const sidebarOpen = useThemeStore((s) => s.sidebarOpen);
  const sidebarWidth = useThemeStore((s) => s.sidebarWidth);
  const theme = useThemeStore((s) => s.theme);
  const terminalSkin = useThemeStore((s) => s.terminalSkin);
  const terminalSkinAuto = useThemeStore((s) => s.terminalSkinAuto);
  const resyncTerminalSkin = useThemeStore((s) => s.setTerminalSkinAuto);
  const pathname = usePathname();
  const isDashboard = pathname === '/workspace';
  const incognitoRaw = usePrivacyStore((s) => s.incognito);
  const incognito = hydrated && incognitoRaw;
  const effectiveSidebarOpen = hydrated ? sidebarOpen : true;
  const widthPx = effectiveSidebarOpen
    ? hydrated
      ? `${sidebarWidth}px`
      : 'var(--xv-boot-sidebar-width, 248px)'
    : '64px';

  // Keep the terminal skin aligned with the shell theme — but only while the skin is
  // still tracking it. This effect used to run unconditionally, which meant any skin
  // the user picked was reset on the next render.
  useEffect(() => {
    if (!hydrated || !terminalSkinAuto) return;
    const expected = skinForTheme(normalizeTheme(theme));
    // `setTerminalSkin` records an explicit choice and clears the auto flag, so it
    // cannot be used here — that would turn the sync itself into a user decision.
    if (terminalSkin !== expected) resyncTerminalSkin();
  }, [hydrated, theme, terminalSkin, terminalSkinAuto, resyncTerminalSkin]);

  useEffect(() => {
    document.body.classList.toggle('xv-incognito-active', incognito && isDashboard);
    return () => document.body.classList.remove('xv-incognito-active');
  }, [incognito, isDashboard]);

  return (
    <ShellIdentityProvider displayName={displayName ?? 'there'} email={email}>
      <WorkspacePerformanceProbe />
      <TerminalChatProvider>
        <TerminalScrollProvider>
          <IncognitoFullscreenBackground />
          <div
            className={cn(
              'flex terminal-layout overflow-x-hidden',
              // The workspace shell is measured against the viewport, so the column it
              // lives in must be exactly one viewport tall rather than "at least" —
              // `min-height` lets a tall child stretch the page, which is the same
              // failure as letting the page scroll.
              // `xv-app-ground` paints the page behind the whole application. The stage
              // only covers the workspace column, so the strip beside it — the sidebar's
              // column — showed the marketing page's own background instead of the
              // selected theme.
              isDashboard
                ? 'xv-app-ground h-[100dvh] max-h-[100dvh] overflow-hidden'
                : 'min-h-screen'
            )}
            style={{ '--sidebar-width': widthPx } as React.CSSProperties}
            data-testid="workspace-shell"
          >
            <Sidebar displayName={displayName} email={email} />
            <div
              className={cn(
                'xv-main-column flex-1 flex flex-col w-full min-w-0 max-w-full overflow-x-hidden relative z-[2]',
                isDashboard ? 'h-full min-h-0' : 'min-h-screen'
              )}
            >
              {!isDashboard ? (
                <header
                  className="xv-site-header xv-site-header-transparent absolute inset-x-0 top-0 z-30 flex items-center justify-between gap-2 sm:gap-4 px-3 sm:px-6 py-2 sm:py-3"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <HeaderLogo />
                  </div>
                  <div className="flex items-center gap-1.5 sm:gap-3 ml-auto shrink-0 relative z-[250]">
                    <ThemeToggle />
                  </div>
                </header>
              ) : null}

              {/* The workspace is the one route that owns its whole viewport: it renders a
                  desktop-application shell that must keep its rounded corners no matter how
                  far the transcript is scrolled. Letting `main` scroll would make the page
                  the scrolling surface, and the shell would ride up out of its inset and
                  read as a full-bleed square. So here `main` only clips, and the terminal
                  pane inside the shell owns the scrollbar. Every other route keeps the
                  padded, page-scrolling behaviour it already had. */}
              <main
                className={cn(
                  'relative z-[1]',
                  isDashboard
                    ? 'xv-workspace-main flex-1 min-h-0 overflow-hidden'
                    : [
                        'flex-1 overflow-y-auto overflow-x-hidden xv-main-scroll-under-header',
                        'p-3 sm:p-6 lg:p-8 pb-24 lg:pb-8',
                      ]
                )}
              >
                {children}
              </main>
              <TerminalDock />
            </div>
            <MobileNav />
          </div>
        </TerminalScrollProvider>
      </TerminalChatProvider>
    </ShellIdentityProvider>
  );
}
