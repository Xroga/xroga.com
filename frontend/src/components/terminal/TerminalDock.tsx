'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { TerminalChatBar } from './TerminalChatBar';
import { ChatbarQueueOutside } from './ChatbarQueueOutside';
import { RepoContextBar } from './RepoContextBar';
import { BlackHoleVButton } from './BlackHoleVButton';
import { TalkButtonChatbarMount } from '@/components/voice/TalkButton';
import { useTerminalScroll } from '@/context/TerminalScrollContext';
import { ChevronDown } from 'lucide-react';
import { useThemeStore } from '@/store/useThemeStore';
import { usePrivacyStore } from '@/store/usePrivacyStore';
import { useVisualViewportBottom } from '@/hooks/useVisualViewportBottom';
import { INCOGNITO_PRIVATE_ROOM_NOTICE } from '@/lib/incognito';
import { cn } from '@/lib/utils';

export function TerminalDock() {
  const pathname = usePathname();
  const sidebarOpen = useThemeStore((s) => s.sidebarOpen);
  const sidebarWidth = useThemeStore((s) => s.sidebarWidth);
  const terminalFullscreen = useThemeStore((s) => s.terminalFullscreen);
  const incognito = usePrivacyStore((s) => s.incognito);
  const keyboardOffset = useVisualViewportBottom();
  const dockInnerRef = useRef<HTMLDivElement>(null);
  const { showJumpToLatest, scrollToLatest } = useTerminalScroll();
  const isDashboard = pathname === '/dashboard' || pathname === '/dashboard/';
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
        '--sidebar-width': `${sidebarOpen ? sidebarWidth : 72}px`,
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
        {!incognito && (
          <div className="flex flex-col px-0.5">
            <BlackHoleVButton className="xv-blackhole-outside self-start" />
            <RepoContextBar outside />
          </div>
        )}
        <ChatbarQueueOutside />
        <div className="xv-chatbar-stack relative">
          <TalkButtonChatbarMount />
          <TerminalChatBar />
        </div>
        {incognito ? (
          <p className="text-[10px] sm:text-xs text-center text-white py-2 sm:py-2.5 px-3 font-medium leading-relaxed xv-incognito-room-notice">
            {INCOGNITO_PRIVATE_ROOM_NOTICE}
          </p>
        ) : (
          <p className="text-[8px] sm:text-[10px] text-center text-[var(--muted)] py-1 sm:py-1.5 px-2 font-terminal xv-chatbar-disclaimer leading-relaxed">
            <span className="hidden sm:inline">
              We give our best, but perfection is Allah&apos;s alone. XROGA AI verifies every critical output before publish.
            </span>
            <span className="sm:hidden">Allah alone is perfect · XROGA verifies outputs</span>
          </p>
        )}
      </div>
    </div>
  );
}
