'use client';

import { SwarmMessageLog } from '@/components/terminal/SwarmMessageLog';
import { IncognitoProfileBox } from '@/components/incognito/IncognitoProfileBox';
import { usePrivacyStore } from '@/store/usePrivacyStore';

export function IncognitoDashboard() {
  const setIncognito = usePrivacyStore((s) => s.setIncognito);

  return (
    <div className="relative z-[1] w-full min-h-[min(100dvh,900px)] space-y-4 sm:space-y-5 py-2 sm:py-4 px-1 sm:px-2">
      <header className="text-center space-y-2 sm:space-y-3 pt-1">
        <div className="flex justify-center">
          <IncognitoProfileBox size="sidebar" className="!w-16 !h-16 sm:!w-[72px] sm:!h-[72px] ring-2 ring-white/25" />
        </div>
        <p className="text-[10px] sm:text-xs tracking-[0.28em] uppercase text-white/45 font-medium">
          Private room
        </p>
        <h1 className="xv-incognito-title text-2xl sm:text-4xl font-light tracking-[0.18em] text-white uppercase select-none">
          Incognito
        </h1>
        <p className="text-xs sm:text-sm text-white/55 max-w-md mx-auto leading-relaxed px-2">
          Chat privately in a temporary gray room. Nothing is saved to your history.
        </p>
        <button
          type="button"
          onClick={() => setIncognito(false)}
          className="inline-flex items-center gap-1.5 mt-1 px-3 py-1.5 rounded-full text-[10px] sm:text-xs font-semibold border border-white/25 text-white/75 hover:text-white hover:border-white/45 transition-colors"
        >
          <IncognitoProfileBox size="modal" className="!w-5 !h-5 !ring-0" />
          Exit private room
        </button>
      </header>

      <div className="w-full max-w-4xl lg:max-w-5xl mx-auto">
        <SwarmMessageLog incognito />
      </div>
    </div>
  );
}
