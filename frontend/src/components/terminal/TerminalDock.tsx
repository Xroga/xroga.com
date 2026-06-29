'use client';

import { usePathname } from 'next/navigation';
import { TerminalChatBar } from './TerminalChatBar';
import { RepoContextBar } from './RepoContextBar';
import { BlackHoleVButton } from './BlackHoleVButton';
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
  const isDashboard = pathname === '/dashboard' || pathname === '/dashboard/';
  const dashboardFullscreen = isDashboard && terminalFullscreen;

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
      <div
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
        <TerminalChatBar />
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
