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

export function TerminalDock() {
  const pathname = usePathname();
  const hydrated = useHydrated();
  const sidebarOpen = useThemeStore((s) => s.sidebarOpen);
  const sidebarWidth = useThemeStore((s) => s.sidebarWidth);
  const terminalFullscreenRaw = useThemeStore((s) => s.terminalFullscreen);
  const chatbarHiddenRaw = useThemeStore((s) => s.chatbarHidden);
  const workspaceOpenRaw = useProjectWorkspaceStore((s) => s.workspaceOpen);
  const incognitoRaw = usePrivacyStore((s) => s.incognito);
  const incognito = hydrated && incognitoRaw;
  const keyboardOffset = useVisualViewportBottom();
  const dockInnerRef = useRef<HTMLDivElement>(null);
  const { showJumpToLatest, scrollToLatest } = useTerminalScroll();
  const isDashboard = pathname === '/workspace' || pathname === '/workspace/';
  const terminalFullscreen = hydrated && terminalFullscreenRaw;
  const chatbarHidden = hydrated && chatbarHiddenRaw;
  const workspaceOpen = hydrated && workspaceOpenRaw;
  const dashboardFullscreen = isDashboard && terminalFullscreen;
  const { messages, loading, sessionRestoring } = useTerminalChat();
  const emptyWorkspace = hydrated && !sessionRestoring && messages.length === 0 && !loading;

  useEffect(() => {
    if (!isDashboard) return;
    const el = dockInnerRef.current;
    if (!el) return;
    const sync = () => {
      document.documentElement.style.setProperty('--xv-chatbar-height', `${el.offsetHeight}px`);
    };
    // Re-measure when the bar collapses, otherwise the transcript keeps reserving
    // room for a composer that is no longer on screen — the whole point of hiding it.
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, [incognito, isDashboard, chatbarHidden]);

  return (
    <div
      className={cn(
        'xv-terminal-dock fixed left-0 right-0 transition-[left,opacity,transform,bottom,z-index] duration-300',
        !isDashboard && 'hidden',
        dashboardFullscreen ? 'z-[210] xv-terminal-dock--fullscreen' : 'z-[55] lg:left-[var(--sidebar-width)]',
        incognito && 'xv-terminal-dock--incognito',
        emptyWorkspace && !incognito && !chatbarHidden && 'xv-terminal-dock--idle'
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
      data-workspace-state={emptyWorkspace ? 'empty' : 'conversation'}
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
        ref={dockInnerRef}
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
              {/* The repo context sits in this thin strip below the composer, as a
                  compact chip — not the verbose `outside` mode, which renders a full
                  sentence ("Loading repositories…") and full name/branch text. That
                  variant belongs on pages with room for it; here it reintroduces the
                  exact height and clutter the compact chip exists to avoid. */}
              <ChatbarQueueOutside />
              <div className="xv-chatbar-stack relative">
                {!incognito ? <CompanionComposerAnchor /> : null}
                <TerminalChatBar />
              </div>
              {!incognito ? (
                <div className="xv-chatbar-context-strip">
                  <RepoContextBar compact />
                </div>
              ) : null}
              {emptyWorkspace && !incognito ? (
                <div className="xv-workspace-starter-stack">
                  <WorkspaceStarterIdeas />
                  <WorkspaceShowcaseStarts />
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
