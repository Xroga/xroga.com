'use client';

import { SwarmMessageLog } from '@/components/terminal/SwarmMessageLog';
import { QuickActionTabs } from '@/components/terminal/QuickActionTabs';
import { BrowserPanel } from '@/components/terminal/BrowserPanel';
import { ApiConnectionBanner } from '@/components/dashboard/ApiConnectionBanner';
import { DashboardWelcome } from '@/components/dashboard/DashboardWelcome';
import { useAppStore } from '@/store/useAppStore';
import { useThemeStore } from '@/store/useThemeStore';
import { useEffect } from 'react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface DashboardViewProps {
  displayName: string;
}

export function DashboardView({ displayName }: DashboardViewProps) {
  const fullscreen = useThemeStore((s) => s.terminalFullscreen);
  const setFullscreen = useThemeStore((s) => s.setTerminalFullscreen);
  const sidebarOpen = useThemeStore((s) => s.sidebarOpen);
  const sidebarWidth = useThemeStore((s) => s.sidebarWidth);
  const browserOpen = useThemeStore((s) => s.browserPanelOpen);
  const browserFullscreen = useThemeStore((s) => s.browserFullscreen);
  const setProfile = useAppStore((s) => s.setProfile);

  const widthPx = sidebarOpen ? sidebarWidth : 72;

  useEffect(() => {
    api.profile
      .get()
      .then((p) => setProfile(p))
      .catch(() =>
        setProfile({ display_name: displayName, avatar_url: null, timezone: 'UTC', language: 'en' })
      );
  }, [displayName, setProfile]);

  const terminalBlock = (
    <div className="space-y-3">
      <QuickActionTabs />
      {browserFullscreen && browserOpen ? (
        <BrowserPanel mode="full" />
      ) : (
        <div
          className={cn(
            'gap-3 transition-all duration-300',
            browserOpen ? 'grid grid-cols-1 lg:grid-cols-2 items-stretch' : 'block'
          )}
        >
          <div className="space-y-3 min-w-0 order-1">
            <SwarmMessageLog />
          </div>
          {browserOpen && (
            <div className="order-2 min-w-0">
              <BrowserPanel mode="split" />
            </div>
          )}
        </div>
      )}
    </div>
  );

  if (fullscreen) {
    return (
      <div
        className="fixed z-[20] flex flex-col overflow-y-auto bg-transparent px-4 sm:px-6 pt-2"
        style={{
          top: '88px',
          bottom: '180px',
          left: `${widthPx}px`,
          right: 0,
        }}
      >
        {terminalBlock}
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <DashboardWelcome displayName={displayName} hidden={fullscreen} className="flex-1 min-w-0" />
        <button
          type="button"
          onClick={() => setFullscreen(true)}
          className="xv-footer-pill !text-xs flex items-center gap-1.5 shrink-0 !text-[var(--foreground)]"
          title="Fullscreen terminal"
        >
          Fullscreen
        </button>
      </div>

      <ApiConnectionBanner />
      {terminalBlock}
    </div>
  );
}
