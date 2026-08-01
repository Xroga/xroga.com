'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { TerminalChatBar } from './TerminalChatBar';
import { ChatbarQueueOutside } from './ChatbarQueueOutside';
import { CompanionComposerAnchor } from '@/components/companion/CompanionSurfaces';
import { useTerminalScroll } from '@/context/TerminalScrollContext';
import { ChevronDown, PanelBottomOpen } from 'lucide-react';
import { useThemeStore } from '@/store/useThemeStore';
import { usePrivacyStore } from '@/store/usePrivacyStore';
import { useVisualViewportBottom } from '@/hooks/useVisualViewportBottom';
import { useHydrated } from '@/hooks/useHydrated';
import { INCOGNITO_PRIVATE_ROOM_NOTICE } from '@/lib/incognito';
import { cn } from '@/lib/utils';
import { useProjectWorkspaceStore } from '@/store/useProjectWorkspaceStore';

export function TerminalDock() {
  const pathname = usePathname();
  const hydrated = useHydrated();
  const sidebarOpen = useThemeStore((s) => s.sidebarOpen);
  const sidebarWidth = useThemeStore((s) => s.sidebarWidth);
  const terminalFullscreen = useThemeStore((s) => s.terminalFullscreen);
  const chatbarHidden = useThemeStore((s) => s.chatbarHidden);
  const setChatbarHidden = useThemeStore((s) => s.setChatbarHidden);
  const workspaceOpen = useProjectWorkspaceStore((s) => s.workspaceOpen);
  const incognitoRaw = usePrivacyStore((s) => s.incognito);
  const incognito = hydrated && incognitoRaw;
  const keyboardOffset = useVisualViewportBottom();
  const dockInnerRef = useRef<HTMLDivElement>(null);
  const { showJumpToLatest, scrollToLatest } = useTerminalScroll();
  const isDashboard = pathname === '/workspace' || pathname === '/workspace/';
  const dashboardFullscreen = isDashboard && terminalFullscreen;

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

  if (!isDashboard) return null;

  return (
    <div
      className={cn(
        'xv-terminal-dock fixed left-0 right-0 transition-[left,opacity,transform,bottom,z-index] duration-300',
        dashboardFullscreen ? 'z-[210] xv-terminal-dock--fullscreen' : 'z-[55] lg:left-[var(--sidebar-width)]',
        incognito && 'xv-terminal-dock--incognito'
      )}
      style={{
        '--sidebar-width': `${(hydrated ? sidebarOpen : true) ? (hydrated ? sidebarWidth : 256) : 72}px`,
        bottom: keyboardOffset,
      } as React.CSSProperties}
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
          'mx-auto px-2 sm:px-4 lg:px-6 pt-2 sm:pt-3 pb-1.5 sm:pb-3 lg:pb-4 xv-terminal-dock-inner',
          dashboardFullscreen
            ? 'max-w-6xl'
            : workspaceOpen
              ? 'max-w-[1400px] xl:pr-[calc(40%+1.5rem)]'
              : 'max-w-4xl'
        )}
      >
        {chatbarHidden ? (
          /* Collapsed. A single slim bar rather than nothing at all — a composer that
             vanishes with no way back reads as a bug, and this is also the affordance
             that brings it back on touch, where the toolbar toggle may be scrolled
             out of view. */
          <button
            type="button"
            onClick={() => setChatbarHidden(false)}
            className="xv-chatbar-restore"
            title="Show the chatbar"
          >
            <PanelBottomOpen className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Show chatbar</span>
          </button>
        ) : (
          <div className="flex items-end gap-3">
            <div className="flex-1 min-w-0">
              {/* The repo context row above the composer is gone: it moved inside, onto
                  the composer's bottom row as a compact chip. That reclaims the last
                  row of height above the input, which is what made the area feel
                  crowded. */}
              <ChatbarQueueOutside />
              <div className="xv-chatbar-stack relative">
                {!incognito ? <CompanionComposerAnchor /> : null}
                <TerminalChatBar />
              </div>
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
