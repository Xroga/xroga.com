'use client';

import { Maximize2, Minimize2 } from 'lucide-react';
import { SwarmMessageLog } from '@/components/terminal/SwarmMessageLog';
import { QuickActionTabs } from '@/components/terminal/QuickActionTabs';
import { BrowserPanel } from '@/components/terminal/BrowserPanel';
import { ApiConnectionBanner } from '@/components/dashboard/ApiConnectionBanner';
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
  const browserOpen = useThemeStore((s) => s.browserPanelOpen);
  const browserFullscreen = useThemeStore((s) => s.browserFullscreen);
  const setProfile = useAppStore((s) => s.setProfile);

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
          <div className="space-y-3 min-w-0">
            <SwarmMessageLog />
          </div>
          {browserOpen && <BrowserPanel mode="split" />}
        </div>
      )}
    </div>
  );

  if (fullscreen) {
    return (
      <div
        className="fixed z-20 flex flex-col overflow-y-auto bg-transparent px-4 sm:px-6"
        style={{
          top: '56px',
          bottom: '220px',
          left: sidebarOpen ? '16rem' : '4.5rem',
          right: 0,
        }}
      >
        <div className="flex items-center justify-end mb-2 shrink-0 pt-2">
          <button
            type="button"
            onClick={() => setFullscreen(false)}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg hover:bg-white/10"
          >
            <Minimize2 className="w-3.5 h-3.5" /> Exit fullscreen
          </button>
        </div>
        {terminalBlock}
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-start justify-end gap-4">
        <button
          type="button"
          onClick={() => setFullscreen(true)}
          className="shrink-0 flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg hover:bg-white/10 ml-auto"
          title="Fullscreen terminal"
        >
          <Maximize2 className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Fullscreen</span>
        </button>
      </div>

      <ApiConnectionBanner />
      {terminalBlock}
    </div>
  );
}
