'use client';

import { SwarmMessageLog } from '@/components/terminal/SwarmMessageLog';
import { DevWorkspacePanel } from '@/components/terminal/DevWorkspacePanel';
import { ApiConnectionBanner } from '@/components/dashboard/ApiConnectionBanner';
import { DashboardWelcome } from '@/components/dashboard/DashboardWelcome';
import { useAppStore } from '@/store/useAppStore';
import { useThemeStore } from '@/store/useThemeStore';
import { useEffect } from 'react';
import { cn } from '@/lib/utils';
import { useProjectWorkspaceStore } from '@/store/useProjectWorkspaceStore';
import { useShellIdentity } from '@/components/layout/ShellIdentityContext';
import { useHydrated } from '@/hooks/useHydrated';

export function DashboardView() {
  const shellIdentity = useShellIdentity();
  const profile = useAppStore((s) => s.profile);
  const displayName = profile?.display_name ?? shellIdentity.displayName;
  const hydrated = useHydrated();
  const fullscreen = useThemeStore((s) => s.terminalFullscreen);
  const workspaceOpenRaw = useProjectWorkspaceStore((s) => s.workspaceOpen);
  const workspaceOpen = hydrated && workspaceOpenRaw;

  useEffect(() => {
    document.body.classList.toggle('xv-terminal-fullscreen-active', fullscreen);
    return () => document.body.classList.remove('xv-terminal-fullscreen-active');
  }, [fullscreen]);

  useEffect(() => {
    useThemeStore.getState().setBrowserPanelOpen(false);
  }, []);

  const chatColumn = (
    <div className={cn('space-y-3 w-full min-w-0', fullscreen && 'xv-fullscreen-terminal max-w-none')}>
      <SwarmMessageLog />
    </div>
  );

  if (fullscreen) {
    return (
      <div className="xv-fullscreen-overlay xv-dashboard-fullscreen fixed inset-0 z-[200] flex flex-col bg-transparent w-screen">
        <div className="xv-dashboard-fullscreen-stage flex-1 min-h-0 overflow-hidden w-full max-w-none px-2 sm:px-4 pt-2">
          <div className="h-full min-w-0 overflow-hidden">{chatColumn}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[1400px] mx-auto space-y-4 sm:space-y-5 min-w-0">
      <DashboardWelcome displayName={displayName} hidden={fullscreen} />
      <ApiConnectionBanner />
      <div
        className={cn(
          'grid grid-cols-1 gap-4 items-start',
          workspaceOpen && 'xl:grid-cols-[minmax(0,1fr)_minmax(340px,40%)]'
        )}
      >
        <div className={cn('min-w-0 w-full', !workspaceOpen && 'max-w-4xl mx-auto')}>
          {chatColumn}
        </div>
        <DevWorkspacePanel className="xl:sticky xl:top-20 xl:max-h-[calc(100vh-7rem)]" />
      </div>
    </div>
  );
}
