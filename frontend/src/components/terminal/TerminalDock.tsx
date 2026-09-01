'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { TerminalChatBar } from './TerminalChatBar';
import { RepoContextBar } from './RepoContextBar';
import { ChatbarQueueOutside } from './ChatbarQueueOutside';
import { CompanionComposerAnchor } from '@/components/companion/CompanionSurfaces';
import { useTerminalScroll } from '@/context/TerminalScrollContext';
import { ChevronDown } from 'lucide-react';
import { useThemeStore } from '@/store/useThemeStore';
import { usePrivacyStore } from '@/store/usePrivacyStore';
import { useVisualViewportBottom } from '@/hooks/useVisualViewportBottom';
import { useHydrated } from '@/hooks/useHydrated';
import { INCOGNITO_PRIVATE_ROOM_NOTICE } from '@/lib/incognito';
import { cn } from '@/lib/utils';
import { useProjectWorkspaceStore } from '@/store/useProjectWorkspaceStore';
import { useTerminalChat } from '@/context/TerminalChatContext';
import { WorkspaceStarterIdeas } from '@/components/dashboard/WorkspaceStarterIdeas';
import { WorkspaceShowcaseStarts } from '@/components/dashboard/WorkspaceShowcaseStarts';
import { DashboardWelcome, WorkspaceComposerKicker } from '@/components/dashboard/DashboardWelcome';
import { useAppStore } from '@/store/useAppStore';
import { useShellIdentity } from '@/components/layout/ShellIdentityContext';

const FULLSCREEN_BUILD_COMMANDS = [
  '/ launch-ready product from one clear brief',
  '/audit this repository and fix the highest-impact issue',
  '/ship a responsive app with tests and deployment',
  '/turn a rough idea into a working first release',
] as const;

export function TerminalDock() {
  const dockRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const shellIdentity = useShellIdentity();
  const profile = useAppStore((s) => s.profile);
  const displayName = profile?.display_name ?? shellIdentity.displayName;
  const hydrated = useHydrated();
  const sidebarOpen = useThemeStore((s) => s.sidebarOpen);
  const sidebarWidth = useThemeStore((s) => s.sidebarWidth);
  const terminalFullscreenRaw = useThemeStore((s) => s.terminalFullscreen);
  const terminalSkinRaw = useThemeStore((s) => s.terminalSkin);
  const chatbarHiddenRaw = useThemeStore((s) => s.chatbarHidden);
  const workspaceOpenRaw = useProjectWorkspaceStore((s) => s.workspaceOpen);
  const incognitoRaw = usePrivacyStore((s) => s.incognito);
  const incognito = hydrated && incognitoRaw;
  const keyboardOffset = useVisualViewportBottom();
  const { showJumpToLatest, scrollToLatest } = useTerminalScroll();
  const isDashboard = pathname === '/workspace' || pathname === '/workspace/';
  const terminalFullscreen = hydrated && terminalFullscreenRaw;
  const terminalSkin = hydrated ? terminalSkinRaw : 'dark';
  const chatbarHidden = hydrated && chatbarHiddenRaw;
  const workspaceOpen = hydrated && workspaceOpenRaw;
  const dashboardFullscreen = isDashboard && terminalFullscreen;
  const { messages, loading, sessionRestoring } = useTerminalChat();
  const emptyWorkspace = hydrated && !sessionRestoring && messages.length === 0 && !loading;
  // Project edits owns the right pane and its draggable seam. Keep the composer in
  // the normal bottom dock while that pane is open so the empty-state surface never
  // sits above (and intercepts) the resize handle.
  const showStarterExperience = emptyWorkspace && !workspaceOpen;

  useEffect(() => {
    if (!isDashboard) return;
    // TerminalChatBar owns the live composer measurement. Measuring this whole dock
    // also included starter tabs and template cards, so selecting a repository could
    // change the value from ~90px to 350px and visibly move the workspace. The parent
    // only needs to clear the reservation when the composer is intentionally hidden.
    if (chatbarHidden) {
      document.documentElement.style.setProperty('--xv-chatbar-height', '0px');
    }
  }, [isDashboard, chatbarHidden]);

  useEffect(() => {
    if (!showStarterExperience) return;
    const frame = window.requestAnimationFrame(() => {
      dockRef.current?.scrollTo({ top: 0 });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [showStarterExperience]);

  return (
    <div
      ref={dockRef}
      className={cn(
        'xv-terminal-dock fixed left-0 right-0 transition-[left,opacity] duration-200',
        !isDashboard && 'hidden',
        dashboardFullscreen ? 'z-[210] xv-terminal-dock--fullscreen' : 'z-[55] lg:left-[var(--sidebar-width)]',
        incognito && 'xv-terminal-dock--incognito',
        sessionRestoring && 'xv-terminal-dock--restoring',
        showStarterExperience && !incognito && !chatbarHidden && 'xv-terminal-dock--idle',
        `terminal-skin-${incognito ? 'dark' : terminalSkin}`,
      )}
      style={{
        '--sidebar-width': (hydrated ? sidebarOpen : true)
          ? hydrated
            ? `${sidebarWidth}px`
            : 'var(--xv-boot-sidebar-width, 256px)'
          : '64px',
        bottom: keyboardOffset,
      } as React.CSSProperties}
      aria-hidden={!isDashboard}
      data-workspace-state={showStarterExperience ? 'empty' : 'conversation'}
      data-testid="persistent-terminal-dock"
    >
      {showJumpToLatest && (
        <button
          type="button"
          onClick={() => scrollToLatest('smooth')}
          className={cn(
            'absolute z-[220] flex h-7 w-7 items-center justify-center rounded-full',
            'border border-[var(--card-border)] bg-[var(--card)]/95 backdrop-blur-md shadow-md',
            'text-[var(--foreground)] hover:bg-[var(--accent)]/10 hover:border-[var(--accent)]/40',
            'transition-all animate-in fade-in zoom-in-95',
            dashboardFullscreen ? 'right-6 top-3' : 'right-3 sm:right-4 lg:right-6 top-2',
          )}
          aria-label="Jump to latest output"
          title="Jump to latest"
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      )}
      <div
        className={cn(
          'mx-auto px-2 sm:px-4 lg:px-6 pt-1.5 sm:pt-2 pb-0.5 sm:pb-1 xv-terminal-dock-inner',
          dashboardFullscreen
            /* Bounded, like every other state. `max-w-none` stretched the composer to
               the full width of the screen, so on a wide monitor a one-line prompt sat
               in a field over a metre of pixels long and the caret started nowhere near
               the text above it. */
            ? 'max-w-3xl px-2 sm:px-4'
            : workspaceOpen
              ? 'max-w-[1400px] xl:pr-[calc(40%+1.5rem)]'
              : 'max-w-4xl'
        )}
      >
        {chatbarHidden ? (
          /* Nothing. Hiding the chatbar hides the chatbar.
             This used to leave a small floating restore button in the composer's
             place, on the reasoning that a hidden control needs a way back. It has
             one: the same toggle in the terminal's title bar that hid it, which
             stays on screen and flips to "Show the chatbar". The floating button was
             a second control for one job, sitting in the space the reader had just
             asked to have back. */
          null
        ) : (
          <div className="flex items-end gap-3">
            <div className="flex-1 min-w-0">
              {dashboardFullscreen && emptyWorkspace && !incognito ? (
                <div className="xv-fullscreen-inspiration" aria-label="Command inspiration">
                  <div aria-hidden="true">
                    {FULLSCREEN_BUILD_COMMANDS.map((command, index) => (
                      <code
                        key={command}
                        style={{ '--xv-command-index': index } as React.CSSProperties}
                      >
                        {command}
                      </code>
                    ))}
                  </div>
                </div>
              ) : null}
              {/* The repo context sits in this thin strip below the composer, as a
                  compact chip — not the verbose `outside` mode, which renders a full
                  sentence ("Loading repositories…") and full name/branch text. That
                  variant belongs on pages with room for it; here it reintroduces the
                  exact height and clutter the compact chip exists to avoid. */}
              <ChatbarQueueOutside />
              {showStarterExperience && !incognito ? (
                <DashboardWelcome composer />
              ) : null}
              <div className="xv-chatbar-stack relative">
                {showStarterExperience && !incognito ? (
                  <WorkspaceComposerKicker displayName={displayName} />
                ) : null}
                {!incognito ? <CompanionComposerAnchor /> : null}
                <TerminalChatBar />
              </div>
              {!incognito ? (
                <div className="xv-chatbar-context-strip">
                  <RepoContextBar compact />
                </div>
              ) : null}
              {showStarterExperience && !incognito ? (
                <div className="xv-workspace-starter-stack">
                  <WorkspaceStarterIdeas />
                  <WorkspaceShowcaseStarts className="xv-workspace-showcase-below-fold" />
                </div>
              ) : null}
            </div>
          </div>
        )}
        {incognito ? (
          <p className="text-[10px] sm:text-xs text-center text-white py-2 sm:py-2.5 px-3 font-medium leading-relaxed xv-incognito-room-notice">
            {INCOGNITO_PRIVATE_ROOM_NOTICE}
          </p>
        ) : null}
      </div>
    </div>
  );
}
