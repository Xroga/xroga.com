'use client';

import { QuickActionTabs } from './QuickActionTabs';
import { TerminalChatBar } from './TerminalChatBar';

export function TerminalDock() {
  return (
    <div
      className="terminal-dock fixed z-40 bottom-14 lg:bottom-0 left-0 right-0 lg:left-[var(--sidebar-width)] transition-[left] duration-300"
    >
      <div className="px-3 sm:px-4 pt-2 max-w-5xl mx-auto w-full">
        <QuickActionTabs />
        <TerminalChatBar />
      </div>
    </div>
  );
}
