'use client';

import { usePathname } from 'next/navigation';
import { TerminalChatBar } from './TerminalChatBar';
import { useThemeStore } from '@/store/useThemeStore';

export function TerminalDock() {
  const pathname = usePathname();
  const sidebarOpen = useThemeStore((s) => s.sidebarOpen);
  const isDashboard = pathname === '/dashboard' || pathname === '/dashboard/';

  if (!isDashboard) return null;

  return (
    <div
      className="pointer-events-none fixed z-40 bottom-16 lg:bottom-6 left-0 right-0 lg:left-[var(--sidebar-width)] transition-[left] duration-300"
      style={{ '--sidebar-width': sidebarOpen ? '16rem' : '4.5rem' } as React.CSSProperties}
    >
      <div className="pointer-events-auto max-w-3xl mx-auto px-4 sm:px-6">
        <TerminalChatBar />
      </div>
    </div>
  );
}
