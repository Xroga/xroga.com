'use client';

import { Sidebar } from './Sidebar';
import { MobileNav } from './MobileNav';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { FeedbackWidget } from '@/components/feedback/FeedbackWidget';

interface AppShellProps {
  children: React.ReactNode;
  displayName?: string;
}

export function AppShell({ children, displayName }: AppShellProps) {
  return (
    <div className="flex min-h-screen">
      <Sidebar displayName={displayName} />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="hidden lg:flex items-center justify-end gap-3 px-6 py-4 border-b border-[var(--card-border)] bg-[var(--card)]/50">
          <NotificationBell />
        </header>
        <main className="flex-1 p-4 sm:p-6 lg:p-8 pb-24 lg:pb-8 overflow-auto">{children}</main>
      </div>
      <MobileNav />
      <FeedbackWidget />
    </div>
  );
}
