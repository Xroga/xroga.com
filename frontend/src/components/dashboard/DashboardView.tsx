'use client';

import { Maximize2, Minimize2 } from 'lucide-react';
import { SwarmMessageLog } from '@/components/terminal/SwarmMessageLog';
import { QuickActionTabs } from '@/components/terminal/QuickActionTabs';
import { ApiConnectionBanner } from '@/components/dashboard/ApiConnectionBanner';
import { useAppStore } from '@/store/useAppStore';
import { useThemeStore } from '@/store/useThemeStore';
import { useEffect } from 'react';

interface DashboardViewProps {
  displayName: string;
}

export function DashboardView({ displayName }: DashboardViewProps) {
  const fullscreen = useThemeStore((s) => s.terminalFullscreen);
  const setFullscreen = useThemeStore((s) => s.setTerminalFullscreen);
  const sidebarOpen = useThemeStore((s) => s.sidebarOpen);
  const setProfile = useAppStore((s) => s.setProfile);

  useEffect(() => {
    setProfile({ display_name: displayName, avatar_url: null, timezone: 'UTC', language: 'en' });
  }, [displayName, setProfile]);

  const terminalBlock = (
    <div className="space-y-3">
      <QuickActionTabs />
      <SwarmMessageLog />
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
        <div className="flex items-center justify-between mb-3 shrink-0 pt-2">
          <h2 className="font-terminal text-sm text-[var(--muted)]">xroga@swarm — fullscreen</h2>
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
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">
            Welcome back, <span className="gradient-text">{displayName}</span>! Your AI Swarm is ready.
          </h1>
          <p className="text-[var(--muted)] text-sm mt-1">
            Type in the terminal below — the swarm plans, builds, reviews, and verifies until zero defects.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setFullscreen(true)}
          className="shrink-0 flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg hover:bg-white/10"
          title="Fullscreen terminal (below header, above chatbar)"
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
