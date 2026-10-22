'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { ArrowDown, ArrowUp } from 'lucide-react';

import { TerminalChatBar } from './TerminalChatBar';
import { ChatbarQueueOutside } from './ChatbarQueueOutside';

import { useTerminalScroll } from '@/context/TerminalScrollContext';
import { useThemeStore } from '@/store/useThemeStore';
import { usePrivacyStore } from '@/store/usePrivacyStore';
import { useVisualViewportBottom } from '@/hooks/useVisualViewportBottom';
import { useHydrated } from '@/hooks/useHydrated';
import { INCOGNITO_PRIVATE_ROOM_NOTICE } from '@/lib/incognito';
import { cn } from '@/lib/utils';
import { useProjectWorkspaceStore } from '@/store/useProjectWorkspaceStore';
import { useTerminalChat } from '@/context/TerminalChatContext';
import { WorkspaceStartHeader, WorkspaceStartCards } from '@/components/dashboard/WorkspaceNewTerminal';
import startStyles from '@/components/dashboard/WorkspaceNewTerminal.module.css';
import { CompanionComposerAnchor } from '@/components/companion/CompanionSurfaces';

export function TerminalDock() {
  const dockRef = useRef<HTMLDivElement>(null);

  const pathname = usePathname();

  const hydrated = useHydrated();

  const sidebarOpen =
    useThemeStore((s) => s.sidebarOpen);

  const sidebarWidth =
    useThemeStore((s) => s.sidebarWidth);

  const terminalFullscreenRaw =
    useThemeStore((s) => s.terminalFullscreen);

  const terminalSkinRaw =
    useThemeStore((s) => s.terminalSkin);

  const chatbarHiddenRaw =
    useThemeStore((s) => s.chatbarHidden);

  const workspaceOpenRaw =
    useProjectWorkspaceStore((s) => s.workspaceOpen);

  const incognitoRaw =
    usePrivacyStore((s) => s.incognito);

  const incognito =
    hydrated && incognitoRaw;

  const keyboardOffset =
    useVisualViewportBottom();

  const {
    showJumpToLatest,
    scrollToFirst,
    scrollToLatest,
  } = useTerminalScroll();

  const isDashboard =
    pathname === '/workspace' ||
    pathname === '/workspace/';

  const terminalFullscreen =
    hydrated && terminalFullscreenRaw;

  const terminalSkin =
    hydrated
      ? terminalSkinRaw
      : 'dark';

  const chatbarHidden =
    hydrated && chatbarHiddenRaw;

  const workspaceOpen =
    hydrated && workspaceOpenRaw;

  const dashboardFullscreen =
    isDashboard && terminalFullscreen;

  const {
    messages,
    loading,
    sessionRestoring,
  } = useTerminalChat();

  const emptyWorkspace =
    hydrated &&
    !sessionRestoring &&
    messages.length === 0 &&
    !loading;

  // An empty workspace must never be a black shell with no way to compose.
  // Older saved preferences may keep the chatbar hidden after navigating away
  // from a conversation; automatically restore it for a fresh task.
  const dockSuppressed = chatbarHidden && !emptyWorkspace;

  const showStarterExperience =
    emptyWorkspace &&
    !workspaceOpen;

  useEffect(() => {
    if (isDashboard && emptyWorkspace && chatbarHidden) {
      useThemeStore.getState().setChatbarHidden(false);
    }
  }, [isDashboard, emptyWorkspace, chatbarHidden]);

  useEffect(() => {
    if (!isDashboard) return;

    if (dockSuppressed) {
      document.documentElement.style.setProperty(
        '--xv-chatbar-height',
        '0px'
      );
    }
  }, [
    isDashboard,
    dockSuppressed,
  ]);

  useEffect(() => {
    if (!showStarterExperience) return;

    const frame =
      window.requestAnimationFrame(() => {
        dockRef.current?.scrollTo({
          top: 0,
        });
      });

    return () =>
      window.cancelAnimationFrame(frame);
  }, [showStarterExperience]);

  return (
    <div
      ref={dockRef}
      className={cn(
        'xv-terminal-dock fixed left-0 right-0 transition-[left,opacity] duration-200',

        !isDashboard &&
          'hidden',

        workspaceOpen &&
          'xv-terminal-dock--workspace-split',

        dashboardFullscreen
          ? 'z-[210] xv-terminal-dock--fullscreen'
          : 'z-[55] lg:left-[var(--sidebar-width)]',

        incognito &&
          'xv-terminal-dock--incognito',

        sessionRestoring &&
          'xv-terminal-dock--restoring',

        showStarterExperience &&
          !incognito &&
          !dockSuppressed &&
          'xv-terminal-dock--idle',

        showStarterExperience && !incognito && !dockSuppressed && startStyles.dock,

        `terminal-skin-${
          incognito
            ? 'dark'
            : terminalSkin
        }`
      )}
      style={
        {
          '--sidebar-width':
            (hydrated
              ? sidebarOpen
              : true)
              ? hydrated
                ? `${sidebarWidth}px`
                : 'var(--xv-boot-sidebar-width, 256px)'
              : '64px',

          bottom:
            keyboardOffset,
          '--xv-start-keyboard': `${keyboardOffset}px`,
        } as React.CSSProperties
      }
      aria-hidden={!isDashboard}
      data-workspace-state={
        showStarterExperience
          ? 'empty'
          : 'conversation'
      }
      data-testid="persistent-terminal-dock"
    >
      <div
        className={cn(
          'mx-auto px-2 sm:px-4 lg:px-6 pt-1.5 sm:pt-2 pb-0.5 sm:pb-1 xv-terminal-dock-inner',

          dashboardFullscreen
            ? 'max-w-3xl px-2 sm:px-4'
            : workspaceOpen
              ? 'max-w-3xl'
              : 'max-w-4xl'
        )}
      >
        {dockSuppressed ? (
          null
        ) : (
          <div className="flex items-end gap-3">
            <div className="flex-1 min-w-0">

              <ChatbarQueueOutside />

              {showStarterExperience &&
              !incognito ? (
                <WorkspaceStartHeader />
              ) : null}

              {/* =========================================
                  KIMI-STYLE COMPOSER FRAME
                  ========================================= */}

              <div className="xv-kimi-composer-frame" data-composer-frame="single">

                <div className="xv-chatbar-stack relative">

                  {!incognito && !showStarterExperience ? <CompanionComposerAnchor /> : null}

                  {messages.length > 0 &&
                  !incognito ? (
                    <button
                      type="button"
                      className={cn(
                        'xv-conversation-navigator',
                        showJumpToLatest ? 'is-direction-down' : 'is-direction-up'
                      )}
                      onClick={() => {
                        if (showJumpToLatest) scrollToLatest('smooth');
                        else scrollToFirst('smooth');
                      }}
                      aria-label={showJumpToLatest ? 'Scroll to latest' : 'Scroll to top'}
                    >
                      {showJumpToLatest ? <ArrowDown size={19} strokeWidth={2.2} aria-hidden="true" /> : <ArrowUp size={19} strokeWidth={2.2} aria-hidden="true" />}
                    </button>
                  ) : null}

                 <TerminalChatBar starter={showStarterExperience && !incognito} />

</div>


</div>

              {/* Starters remain outside the persistent, functional composer. */}

              {showStarterExperience &&
              !incognito ? (
                <WorkspaceStartCards />
              ) : null}

            </div>
          </div>
        )}

        {incognito ? (
          <p className="text-[10px] sm:text-xs text-center text-white py-2 sm:py-2.5 px-3 font-medium leading-relaxed xv-incognito-room-notice">
            {
              INCOGNITO_PRIVATE_ROOM_NOTICE
            }
          </p>
        ) : null}

      </div>
    </div>
  );
}
