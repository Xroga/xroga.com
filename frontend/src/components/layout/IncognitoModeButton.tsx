'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, MessageCircle } from 'lucide-react';
import { usePrivacyStore } from '@/store/usePrivacyStore';
import { useTerminalChat } from '@/context/TerminalChatContext';
import { INCOGNITO_GUIDANCE } from '@/lib/incognito';
import { IncognitoProfileBox } from '@/components/incognito/IncognitoProfileBox';
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
      toast('Exited private room — your normal dashboard is back', { icon: '🔒' });
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
            <div className="fixed z-[410] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(400px,calc(100vw-28px))] rounded-2xl border border-white/20 overflow-hidden shadow-2xl">
              <div className="relative p-5 bg-[#2b2b30]">
                <div className="relative">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2.5">
                      <IncognitoProfileBox size="modal" className="!w-11 !h-11" />
                      <div>
                        <h3 className="font-bold text-white tracking-wide">Private room</h3>
                        <p className="text-[10px] text-white/55">Temporary incognito chat</p>
                      </div>
                    </div>
                    <button type="button" onClick={() => setInfoOpen(false)} className="p-1 text-white/50 hover:text-white">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="text-sm text-white/75 leading-relaxed">
                    Your dashboard switches to a <strong className="text-white">private gray room</strong>. Chat only — messages are <strong className="text-white">not saved</strong> and <strong className="text-white">auto-delete</strong> when you leave.
                  </p>
                  <ul className="mt-3 space-y-2">
                    {INCOGNITO_GUIDANCE.map((line) => (
                      <li key={line} className="flex items-start gap-2 text-[11px] text-white/55 leading-snug">
                        <MessageCircle className="w-3 h-3 text-white/45 shrink-0 mt-0.5" />
                        {line}
                      </li>
                    ))}
                  </ul>
                  <button type="button" onClick={() => setInfoOpen(false)} className="mt-4 w-full py-2.5 rounded-xl bg-white/12 hover:bg-white/18 border border-white/20 text-white text-sm font-bold transition-colors">
                    Enter private room
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
          'flex items-center gap-1.5 px-2 py-1.5 sm:px-2.5 rounded-full text-xs font-semibold border transition-all',
          incognito
            ? 'bg-white/12 border-white/35 text-white shadow-[0_0_16px_rgba(255,255,255,0.08)]'
            : 'glass-panel border-[var(--card-border)] text-[var(--muted)] hover:text-[var(--foreground)]'
        )}
        title={incognito ? 'Exit private room' : 'Enter incognito private room'}
        aria-label={incognito ? 'Exit incognito' : 'Incognito mode'}
      >
        <IncognitoProfileBox size="modal" className="!w-7 !h-7 !ring-white/25" />
        <span className="hidden md:inline">{incognito ? 'Exit' : 'Incognito'}</span>
      </button>
      {modal}
    </>
  );
}
