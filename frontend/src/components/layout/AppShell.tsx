'use client';

import { useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { MobileNav } from './MobileNav';
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

/*
 * There is no logo in this header any more.
 *
 * It was here because below `lg` the sidebar is a drawer, so the header looked like
 * the only place branding could live. The sidebar's own mobile bar carries the mark
 * now, along with the drawer, search and new-terminal controls — and it sits at the
 * top of the same screen. Two Xroga wordmarks a few pixels apart is what that
 * produced, which is what was reported.
 */

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
              {/*
                No page header here any more.
                
                It held a logo and a theme control. The logo went when it turned out to
                be the second Xroga on a phone; the theme control was the second one of
                those too — the sidebar's toolbar carries the real one, beside New and
                Search, and this copy floated over every dashboard tab as a loose
                button with no toolbar to belong to.
                
                With both gone the header was an empty, absolutely-positioned strip at
                `z-30` across the top of every non-workspace page: invisible, and still
                in front of whatever it covered.
              */}

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
