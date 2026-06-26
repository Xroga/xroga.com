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
      className="fixed z-40 bottom-0 left-0 right-0 lg:left-[var(--sidebar-width)] transition-[left] duration-300"
      style={{ '--sidebar-width': sidebarOpen ? '16rem' : '4.5rem' } as React.CSSProperties}
    >
      <div className="max-w-3xl mx-auto px-4 sm:px-6 pb-2 lg:pb-3">
        <TerminalChatBar />
        <p className="text-[9px] text-center text-black/70 py-1.5 px-3 font-terminal xv-chatbar-disclaimer">
          We give our best, but perfection is Allah&apos;s alone. XROGA AI verifies every critical output before publish.
        </p>
      </div>
    </div>
  );
}
