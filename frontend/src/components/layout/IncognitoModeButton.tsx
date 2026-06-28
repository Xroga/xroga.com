'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { EyeOff, X, MessageCircle } from 'lucide-react';
import Image from 'next/image';
import { usePrivacyStore } from '@/store/usePrivacyStore';
import { useTerminalChat } from '@/context/TerminalChatContext';
import { INCOGNITO_AVATAR_URL, INCOGNITO_GUIDANCE } from '@/lib/incognito';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';

export function IncognitoModeButton() {
  const incognito = usePrivacyStore((s) => s.incognito);
  const setIncognito = usePrivacyStore((s) => s.setIncognito);
  const { startNewChat } = useTerminalChat();
  const [infoOpen, setInfoOpen] = useState(false);

  function toggle() {
    if (incognito) {
      startNewChat();
      setIncognito(false);
      toast('Exited incognito — your normal dashboard is back', { icon: '👁️' });
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
            <div className="fixed inset-0 z-[400] bg-black/60 backdrop-blur-sm" onClick={() => setInfoOpen(false)} aria-hidden />
            <div className="fixed z-[410] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(400px,calc(100vw-28px))] rounded-2xl border border-white/15 overflow-hidden shadow-2xl">
              <div className="relative p-5 bg-gradient-to-br from-[#0a0a0f] via-[#12101a] to-[#1a1025]">
                <div className="absolute inset-0 opacity-20 bg-[url('/incognito/bridge-bg.png')] bg-cover bg-center" aria-hidden />
                <div className="relative">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-10 h-10 rounded-full overflow-hidden ring-2 ring-violet-500/40 shrink-0">
                        <Image src={INCOGNITO_AVATAR_URL} alt="" width={40} height={40} unoptimized className="object-cover w-full h-full" />
                      </div>
                      <div>
                        <h3 className="font-bold text-white tracking-wide">Incognito</h3>
                        <p className="text-[10px] text-violet-300/80">Temporary private chat</p>
                      </div>
                    </div>
                    <button type="button" onClick={() => setInfoOpen(false)} className="p-1 text-white/50 hover:text-white">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="text-sm text-white/75 leading-relaxed">
                    Your dashboard switches to a <strong className="text-white">simple temporary workspace</strong>. Chat privately — messages are <strong className="text-white">not saved</strong> and <strong className="text-white">auto-delete</strong> when you leave.
                  </p>
                  <ul className="mt-3 space-y-2">
                    {INCOGNITO_GUIDANCE.map((line) => (
                      <li key={line} className="flex items-start gap-2 text-[11px] text-white/55 leading-snug">
                        <MessageCircle className="w-3 h-3 text-violet-400 shrink-0 mt-0.5" />
                        {line}
                      </li>
                    ))}
                  </ul>
                  <button type="button" onClick={() => setInfoOpen(false)} className="mt-4 w-full py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-bold transition-colors">
                    Enter temporary chat
                  </button>
                </div>
              </div>
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
            ? 'bg-violet-600/25 border-violet-400/50 text-violet-200 shadow-[0_0_20px_rgba(139,92,246,0.25)]'
            : 'glass-panel border-[var(--card-border)] text-[var(--muted)] hover:text-[var(--foreground)]'
        )}
        title={incognito ? 'Exit incognito' : 'Incognito temporary chat'}
      >
        <EyeOff className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">{incognito ? 'Exit Incognito' : 'Incognito'}</span>
      </button>
      {modal}
    </>
  );
}
