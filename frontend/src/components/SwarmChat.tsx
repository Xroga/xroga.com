'use client';

import { SwarmMessageLog } from '@/components/terminal/SwarmMessageLog';

/** @deprecated Use SwarmMessageLog + TerminalDock via AppShell */
export function SwarmChat() {
  return <SwarmMessageLog />;
}
