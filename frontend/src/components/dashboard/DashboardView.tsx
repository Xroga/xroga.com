'use client';

import { SwarmMessageLog } from '@/components/terminal/SwarmMessageLog';
import { QuickActionTabs } from '@/components/terminal/QuickActionTabs';
import { BrowserPanel } from '@/components/terminal/BrowserPanel';
import { ApiConnectionBanner } from '@/components/dashboard/ApiConnectionBanner';
import { DashboardWelcome } from '@/components/dashboard/DashboardWelcome';
import { IncognitoDashboard } from '@/components/dashboard/IncognitoDashboard';
import { useAppStore } from '@/store/useAppStore';
import { useThemeStore } from '@/store/useThemeStore';
import { usePrivacyStore } from '@/store/usePrivacyStore';
import { useHydrated } from '@/hooks/useHydrated';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Maximize2, Minimize2 } from 'lucide-react';

interface DashboardViewProps {
  displayName: string;
}

export function DashboardView({ displayName }: DashboardViewProps) {
  const fullscreen = useThemeStore((s) => s.terminalFullscreen);
  const setFullscreen = useThemeStore((s) => s.setTerminalFullscreen);
  const browserOpen = useThemeStore((s) => s.browserPanelOpen);
  const browserFullscreen = useThemeStore((s) => s.browserFullscreen);
  const hydrated = useHydrated();
  const incognitoRaw = usePrivacyStore((s) => s.incognito);
  const incognito = hydrated && incognitoRaw;
  const setProfile = useAppStore((s) => s.setProfile);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    document.body.classList.toggle('xv-terminal-fullscreen-active', fullscreen);
    return () => document.body.classList.remove('xv-terminal-fullscreen-active');
  }, [fullscreen]);

  useEffect(() => {
    return () => setFullscreen(false);
  }, [setFullscreen]);

  useEffect(() => {
    api.profile
      .get()
      .then((p) => setProfile(p))
      .catch(() =>
        setProfile({ display_name: displayName, avatar_url: null, timezone: 'UTC', language: 'en' })
      );
  }, [displayName, setProfile]);

  useEffect(() => {
    if (fullscreen) return;
    function onScroll() {
      setScrolled(window.scrollY > 72);
    }
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [fullscreen]);

  const fullscreenBtn = (
    <button
      type="button"
      onClick={() => (fullscreen ? setFullscreen(false) : setFullscreen(true))}
      className={cn(
        'xv-fullscreen-enter-pill flex items-center gap-1.5 font-medium transition-all',
        scrolled && !fullscreen && 'xv-fullscreen-pill--fixed',
        fullscreen && 'xv-fullscreen-exit-pill'
      )}
      title={fullscreen ? 'Exit fullscreen' : 'Fullscreen terminal'}
    >
      {fullscreen ? (
        <>
          <Minimize2 className="w-3 h-3" />
          <span className="hidden sm:inline">Exit</span>
        </>
      ) : (
        <>
          <Maximize2 className="w-3 h-3" />
          <span className={cn(scrolled ? 'sr-only sm:not-sr-only' : 'inline')}>Fullscreen</span>
        </>
      )}
    </button>
  );

  const terminalBlock = (
    <div className={cn('space-y-3 w-full', fullscreen && 'xv-fullscreen-terminal max-w-none')}>
      <QuickActionTabs />
      {fullscreen && <div className="flex justify-end">{fullscreenBtn}</div>}
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

  if (incognito) {
    return (
      <div className="w-full min-w-0 min-h-[calc(100dvh-12rem)] relative">
        <IncognitoDashboard />
      </div>
    );
  }

  if (fullscreen) {
    return (
      <div className="xv-fullscreen-overlay xv-dashboard-fullscreen fixed inset-0 z-[200] flex flex-col bg-[var(--background)] w-screen">
        <div className="flex-1 overflow-y-auto overflow-x-hidden w-full max-w-none px-4 sm:px-8 lg:px-12 pt-3 sm:pt-4 pb-[min(340px,calc(48vh+env(safe-area-inset-bottom)))]">
          <div className="w-full max-w-none mx-auto">
            {terminalBlock}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-4 sm:space-y-5 min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-2 sm:gap-3">
        <DashboardWelcome displayName={displayName} hidden={fullscreen} className="flex-1 min-w-0" />
        {!fullscreen && fullscreenBtn}
      </div>

      <ApiConnectionBanner />
      {terminalBlock}
    </div>
  );
}
