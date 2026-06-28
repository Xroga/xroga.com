'use client';

import { usePathname } from 'next/navigation';
import { TerminalChatBar } from './TerminalChatBar';
import { useThemeStore } from '@/store/useThemeStore';
import { useVisualViewportBottom } from '@/hooks/useVisualViewportBottom';
import { cn } from '@/lib/utils';

export function TerminalDock() {
  const pathname = usePathname();
  const sidebarOpen = useThemeStore((s) => s.sidebarOpen);
  const sidebarWidth = useThemeStore((s) => s.sidebarWidth);
  const terminalFullscreen = useThemeStore((s) => s.terminalFullscreen);
  const keyboardOffset = useVisualViewportBottom();
  const isDashboard = pathname === '/dashboard' || pathname === '/dashboard/';
  const dashboardFullscreen = isDashboard && terminalFullscreen;

  if (!isDashboard) return null;

  return (
    <div
      className={cn(
        'xv-terminal-dock fixed left-0 right-0 transition-[left,opacity,transform,bottom,z-index] duration-300',
        dashboardFullscreen ? 'z-[210] xv-terminal-dock--fullscreen' : 'z-[55] lg:left-[var(--sidebar-width)]'
      )}
      style={{
        '--sidebar-width': `${sidebarOpen ? sidebarWidth : 72}px`,
        bottom: keyboardOffset,
      } as React.CSSProperties}
    >
      <div
        className={cn(
          'mx-auto px-2 sm:px-4 lg:px-6 pb-1.5 sm:pb-2 lg:pb-3',
          dashboardFullscreen ? 'max-w-6xl' : 'max-w-3xl'
        )}
      >
        <TerminalChatBar />
        <p className="text-[8px] sm:text-[10px] text-center text-[var(--muted)] py-1 sm:py-1.5 px-2 font-terminal xv-chatbar-disclaimer leading-relaxed">
          <span className="hidden sm:inline">
            We give our best, but perfection is Allah&apos;s alone. XROGA AI verifies every critical output before publish.
          </span>
          <span className="sm:hidden">Allah alone is perfect · XROGA verifies outputs</span>
        </p>
      </div>
    </div>
  );
}
