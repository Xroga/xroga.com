'use client';

import { EyeOff, MessageCircle, Shield, Sparkles } from 'lucide-react';
import { SwarmMessageLog } from '@/components/terminal/SwarmMessageLog';
import { IncognitoProfileBox } from '@/components/incognito/IncognitoProfileBox';
import { INCOGNITO_GUIDANCE } from '@/lib/incognito';
import { usePrivacyStore } from '@/store/usePrivacyStore';

export function IncognitoDashboard() {
  const setIncognito = usePrivacyStore((s) => s.setIncognito);

  return (
    <div className="relative z-[1] space-y-5 sm:space-y-6 py-2 sm:py-4">
      <header className="text-center space-y-2 sm:space-y-3">
        <div className="flex justify-center mb-2">
          <IncognitoProfileBox size="sidebar" className="!w-16 !h-16 sm:!w-20 sm:!h-20 ring-2 ring-violet-400/50" />
        </div>
        <p className="xv-incognito-intro text-[10px] sm:text-xs tracking-[0.35em] uppercase text-amber-200/70 font-medium">
          Introducing
        </p>
        <h1 className="xv-incognito-title text-3xl sm:text-5xl lg:text-6xl font-extralight tracking-[0.22em] text-white uppercase select-none">
          Incognito
        </h1>
        <p className="text-xs sm:text-sm text-white/55 max-w-md mx-auto leading-relaxed">
          A private temporary workspace. Chat freely — your conversation vanishes when you exit.
        </p>
        <button
          type="button"
          onClick={() => setIncognito(false)}
          className="inline-flex items-center gap-1.5 mt-1 px-3 py-1.5 rounded-full text-[10px] sm:text-xs font-semibold border border-white/20 text-white/70 hover:text-white hover:border-white/40 transition-colors"
        >
          <EyeOff className="w-3 h-3" />
          Exit to main dashboard
        </button>
      </header>

      <div className="grid sm:grid-cols-3 gap-2 sm:gap-3 max-w-3xl mx-auto">
        <div className="xv-incognito-card flex items-start gap-2.5 p-3 rounded-xl">
          <MessageCircle className="w-4 h-4 text-violet-300 shrink-0 mt-0.5" />
          <div>
            <p className="text-[11px] font-bold text-white/90">Chat only</p>
            <p className="text-[10px] text-white/50 mt-0.5 leading-snug">{INCOGNITO_GUIDANCE[0]}</p>
          </div>
        </div>
        <div className="xv-incognito-card flex items-start gap-2.5 p-3 rounded-xl">
          <Sparkles className="w-4 h-4 text-violet-300 shrink-0 mt-0.5" />
          <div>
            <p className="text-[11px] font-bold text-white/90">No builds</p>
            <p className="text-[10px] text-white/50 mt-0.5 leading-snug">{INCOGNITO_GUIDANCE[1]}</p>
          </div>
        </div>
        <div className="xv-incognito-card flex items-start gap-2.5 p-3 rounded-xl sm:col-span-1 col-span-full">
          <Shield className="w-4 h-4 text-violet-300 shrink-0 mt-0.5" />
          <div>
            <p className="text-[11px] font-bold text-white/90">Auto-delete</p>
            <p className="text-[10px] text-white/50 mt-0.5 leading-snug">{INCOGNITO_GUIDANCE[2]}</p>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto space-y-2">
        <p className="text-[10px] uppercase tracking-widest text-white/40 font-semibold px-1">
          Temporary chat
        </p>
        <SwarmMessageLog incognito />
      </div>
    </div>
  );
}
