'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { EyeOff, X, Shield } from 'lucide-react';
import { usePrivacyStore } from '@/store/usePrivacyStore';
import { useTerminalChat } from '@/context/TerminalChatContext';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';

export function IncognitoModeButton() {
  const incognito = usePrivacyStore((s) => s.incognito);
  const setIncognito = usePrivacyStore((s) => s.setIncognito);
  const { startNewChat } = useTerminalChat();
  const [infoOpen, setInfoOpen] = useState(false);

  function toggle() {
    if (incognito) {
      setIncognito(false);
      toast('Exited incognito — chats will save again', { icon: '👁️' });
      return;
    }
    startNewChat();
    setIncognito(true);
    setInfoOpen(true);
  }

  const modal =
    infoOpen && typeof document !== 'undefined'
      ? createPortal(
          <>
            <div className="fixed inset-0 z-[400] bg-black/50 backdrop-blur-sm" onClick={() => setInfoOpen(false)} aria-hidden />
            <div className="fixed z-[410] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(380px,calc(100vw-28px))] rounded-2xl border border-violet-500/30 bg-gradient-to-br from-[#1a1025] via-[#0f172a] to-[#1e1b4b] shadow-2xl p-5">
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <Shield className="w-5 h-5 text-violet-400" />
                  <h3 className="font-bold text-white">Incognito chat</h3>
                </div>
                <button type="button" onClick={() => setInfoOpen(false)} className="p-1 text-white/50 hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-sm text-white/75 leading-relaxed">
                Chat privately in a temporary workspace. Messages are <strong className="text-white">not stored</strong> in your history and are <strong className="text-white">automatically deleted</strong> when you leave incognito or close this session.
              </p>
              <p className="text-xs text-violet-300/80 mt-3">Actions still use your fuel meter. Swarm runs normally — only persistence is off.</p>
              <button type="button" onClick={() => setInfoOpen(false)} className="mt-4 w-full py-2.5 rounded-xl bg-violet-600 text-white text-sm font-bold">
                Got it
              </button>
            </div>
          </>,
          document.body
        )
      : null;

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        className={cn(
          'flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-semibold border transition-all',
          incognito
            ? 'bg-violet-600/20 border-violet-500/50 text-violet-300'
            : 'glass-panel border-[var(--card-border)] text-[var(--muted)] hover:text-[var(--foreground)]'
        )}
        title="Incognito chat"
      >
        <EyeOff className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">{incognito ? 'Incognito' : 'Incognito'}</span>
      </button>
      {modal}
    </>
  );
}
