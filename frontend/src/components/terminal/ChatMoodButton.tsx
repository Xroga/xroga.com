'use client';

import { useEffect, useRef, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CHAT_MOODS, useMoodStore } from '@/store/useMoodStore';

export function ChatMoodButton({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const autoEnabled = useMoodStore((s) => s.autoEnabled);
  const mood = useMoodStore((s) => s.mood);
  const setAutoEnabled = useMoodStore((s) => s.setAutoEnabled);
  const setMood = useMoodStore((s) => s.setMood);

  const activeMood = CHAT_MOODS.find((m) => m.id === mood) ?? CHAT_MOODS[6];

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (btnRef.current?.contains(t)) return;
      const pop = document.getElementById('xv-mood-popup');
      if (pop?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <div className={cn('relative shrink-0', className)}>
      {open && (
        <div
          id="xv-mood-popup"
          className="absolute bottom-full left-0 mb-2 z-[80] w-[min(280px,calc(100vw-32px))] rounded-2xl border border-[var(--card-border)] bg-[var(--card)]/98 backdrop-blur-xl shadow-2xl p-3 animate-in fade-in slide-in-from-bottom-2 duration-200"
        >
          <div className="flex items-center justify-between gap-2 mb-2.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">AI Mood</p>
            <button
              type="button"
              onClick={() => setAutoEnabled(!autoEnabled)}
              className={cn(
                'text-[10px] font-bold px-2 py-0.5 rounded-full transition-colors',
                autoEnabled
                  ? 'bg-[#006aff]/20 text-[#60a5fa]'
                  : 'bg-white/5 text-[var(--muted)]'
              )}
            >
              Auto {autoEnabled ? 'ON' : 'OFF'}
            </button>
          </div>
          <p className="text-[10px] text-[var(--muted)] mb-2 leading-snug">
            Pick a mood — Xroga adapts tone to match you.
          </p>
          <div className="grid grid-cols-3 gap-1.5 max-h-[200px] overflow-y-auto">
            {CHAT_MOODS.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  setMood(m.id);
                  setAutoEnabled(true);
                }}
                className={cn(
                  'flex flex-col items-center gap-0.5 p-2 rounded-xl border text-center transition-all',
                  mood === m.id
                    ? 'border-[#006aff]/50 bg-[#006aff]/10'
                    : 'border-transparent hover:bg-white/5'
                )}
              >
                <span className="text-lg leading-none">{m.emoji}</span>
                <span className="text-[9px] font-semibold">{m.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          'xv-chat-mood-btn flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-bold transition-all',
          autoEnabled
            ? 'bg-gradient-to-r from-[#006aff]/25 to-[#60a5fa]/20 text-[#93c5fd] ring-1 ring-[#006aff]/30'
            : 'bg-white/5 text-[var(--muted)] hover:bg-white/10'
        )}
        title="AI mood — auto adapts to your vibe"
      >
        <Sparkles className="w-3 h-3 shrink-0" />
        <span>Auto</span>
        {autoEnabled && <span className="text-xs leading-none">{activeMood.emoji}</span>}
      </button>
    </div>
  );
}
