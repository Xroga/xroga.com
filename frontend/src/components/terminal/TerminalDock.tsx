'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { TerminalChatBar } from './TerminalChatBar';
import { ChatbarQueueOutside } from './ChatbarQueueOutside';
import { RepoContextBar } from './RepoContextBar';
import { BlackHoleVButton } from './BlackHoleVButton';
import { useTerminalScroll } from '@/context/TerminalScrollContext';
import { ChevronDown } from 'lucide-react';
import { useThemeStore } from '@/store/useThemeStore';
import { usePrivacyStore } from '@/store/usePrivacyStore';
import { useVisualViewportBottom } from '@/hooks/useVisualViewportBottom';
import { useHydrated } from '@/hooks/useHydrated';
import { INCOGNITO_PRIVATE_ROOM_NOTICE } from '@/lib/incognito';
import { cn } from '@/lib/utils';

export function TerminalDock() {
  const pathname = usePathname();
  const hydrated = useHydrated();
  const sidebarOpen = useThemeStore((s) => s.sidebarOpen);
  const sidebarWidth = useThemeStore((s) => s.sidebarWidth);
  const terminalFullscreen = useThemeStore((s) => s.terminalFullscreen);
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
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, [incognito, isDashboard]);

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
          dashboardFullscreen ? 'max-w-6xl' : 'max-w-3xl'
        )}
      >
        <div className="flex items-end gap-3">
          <div className="flex-1 min-w-0">
            {!incognito && (
              <div className="flex flex-row items-start justify-between gap-2 px-0.5 mb-0.5">
                <RepoContextBar outside />
                <BlackHoleVButton className="xv-blackhole-outside shrink-0 ml-auto self-start" />
              </div>
            )}
            <ChatbarQueueOutside />
            <div className="xv-chatbar-stack relative">
              <TerminalChatBar />
            </div>
          </div>
        </div>
        {incognito ? (
          <p className="text-[10px] sm:text-xs text-center text-white py-2 sm:py-2.5 px-3 font-medium leading-relaxed xv-incognito-room-notice">
            {INCOGNITO_PRIVATE_ROOM_NOTICE}
          </p>
        ) : (
          <p className="text-[9px] sm:text-[10px] text-center text-[var(--muted)] py-1 sm:py-1.5 px-3 font-terminal xv-chatbar-disclaimer leading-snug max-w-xl mx-auto">
            We give our best — perfection is Allah&apos;s alone. Xroga verifies before publish.
          </p>
        )}
      </div>
    </div>
  );
}
