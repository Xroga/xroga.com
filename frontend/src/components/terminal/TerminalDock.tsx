'use client';

import { usePathname } from 'next/navigation';
import { QuickActionTabs } from './QuickActionTabs';
import { TerminalChatBar } from './TerminalChatBar';
import { useThemeStore } from '@/store/useThemeStore';
import { cn } from '@/lib/utils';

interface TerminalDockProps {
  fullscreen?: boolean;
  onFullscreen?: () => void;
}

export function TerminalDock({ fullscreen, onFullscreen }: TerminalDockProps) {
  const pathname = usePathname();
  const sidebarOpen = useThemeStore((s) => s.sidebarOpen);
  const isDashboard =
    pathname === '/dashboard' || pathname === '/dashboard/';

  if (!isDashboard && !fullscreen) return null;

  return (
    <div
      className={cn(
        'terminal-dock fixed z-40 transition-all duration-300',
        fullscreen
          ? 'inset-0 flex flex-col justify-end bg-black/80 backdrop-blur-md p-4'
          : 'bottom-14 lg:bottom-0 left-0 right-0 lg:left-[var(--sidebar-width)]'
      )}
      style={
        fullscreen
          ? undefined
          : ({ '--sidebar-width': sidebarOpen ? '16rem' : '4.5rem' } as React.CSSProperties)
      }
    >
      <div className={cn('w-full mx-auto', fullscreen ? 'max-w-4xl' : 'max-w-5xl px-3 sm:px-4 pt-2')}>
        <QuickActionTabs />
        <TerminalChatBar onFullscreen={onFullscreen} />
      </div>
    </div>
  );
}
