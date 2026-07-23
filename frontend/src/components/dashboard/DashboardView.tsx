'use client';

import { SwarmMessageLog } from '@/components/terminal/SwarmMessageLog';
import { ProjectWorkspaceRail } from '@/components/terminal/ProjectWorkspaceRail';
import { DevWorkspacePanel } from '@/components/terminal/DevWorkspacePanel';
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
  const setProfile = useAppStore((s) => s.setProfile);

  useEffect(() => {
    document.body.classList.toggle('xv-terminal-fullscreen-active', fullscreen);
    return () => document.body.classList.remove('xv-terminal-fullscreen-active');
  }, [fullscreen]);

  useEffect(() => {
    return () => setFullscreen(false);
  }, [setFullscreen]);

  useEffect(() => {
    useThemeStore.getState().setBrowserPanelOpen(false);
  }, []);

  useEffect(() => {
    api.profile
      .get()
      .then((p) => setProfile(p))
      .catch(() =>
        setProfile({ display_name: displayName, avatar_url: null, timezone: 'UTC', language: 'en' })
      );
  }, [displayName, setProfile]);

  const chatColumn = (
    <div className={cn('space-y-3 w-full min-w-0', fullscreen && 'xv-fullscreen-terminal max-w-none')}>
      <ProjectWorkspaceRail />
      <SwarmMessageLog />
    </div>
  );

  if (fullscreen) {
    return (
      <div className="xv-fullscreen-overlay xv-dashboard-fullscreen fixed inset-0 z-[200] flex flex-col bg-transparent w-screen">
        <div className="flex-1 overflow-hidden w-full max-w-none px-3 sm:px-6 pt-3 pb-[min(340px,calc(48vh+env(safe-area-inset-bottom)))]">
          <div className="h-full grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(360px,42%)] gap-3">
            <div className="min-w-0 overflow-y-auto">{chatColumn}</div>
            <DevWorkspacePanel className="min-h-[50vh] xl:min-h-0 h-full" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[1400px] mx-auto space-y-4 sm:space-y-5 min-w-0">
      <DashboardWelcome displayName={displayName} hidden={fullscreen} />
      <ApiConnectionBanner />
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(340px,40%)] gap-4 items-start">
        {chatColumn}
        <DevWorkspacePanel className="xl:sticky xl:top-20 xl:max-h-[calc(100vh-7rem)]" />
      </div>
    </div>
  );
}
