'use client';

import { usePathname } from 'next/navigation';
import { TerminalChatBar } from './TerminalChatBar';
import { useThemeStore } from '@/store/useThemeStore';
import { useVisualViewportBottom } from '@/hooks/useVisualViewportBottom';

export function TerminalDock() {
  const pathname = usePathname();
  const sidebarOpen = useThemeStore((s) => s.sidebarOpen);
  const sidebarWidth = useThemeStore((s) => s.sidebarWidth);
  const keyboardOffset = useVisualViewportBottom();
  const isDashboard = pathname === '/dashboard' || pathname === '/dashboard/';

  if (!isDashboard) return null;

  return (
    <div
      className="xv-terminal-dock fixed z-[55] left-0 right-0 lg:left-[var(--sidebar-width)] transition-[left,opacity,transform,bottom] duration-300"
      style={{
        '--sidebar-width': `${sidebarOpen ? sidebarWidth : 72}px`,
        bottom: keyboardOffset,
      } as React.CSSProperties}
    >
      <div className="max-w-3xl mx-auto px-2 sm:px-4 lg:px-6 pb-1.5 sm:pb-2 lg:pb-3">
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
