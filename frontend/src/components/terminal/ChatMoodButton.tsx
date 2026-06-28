'use client';

import { useEffect, useRef, useState } from 'react';
import { WandSparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CHAT_MOODS, useMoodStore } from '@/store/useMoodStore';
import { ChatBarTip } from '@/components/ui/ChatBarTip';

export function ChatMoodButton({ className, variant = 'toolbar' }: { className?: string; variant?: 'toolbar' | 'inline' }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const autoEnabled = useMoodStore((s) => s.autoEnabled);
  const mood = useMoodStore((s) => s.mood);
  const setAutoEnabled = useMoodStore((s) => s.setAutoEnabled);
  const setMood = useMoodStore((s) => s.setMood);

  const activeMood = CHAT_MOODS.find((m) => m.id === mood) ?? CHAT_MOODS[6];
  const ActiveIcon = activeMood.icon;

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
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-[90] w-[min(300px,calc(100vw-32px))] max-w-[calc(100vw-32px)] rounded-2xl border border-[#006aff]/20 bg-gradient-to-br from-white via-sky-50/95 to-blue-50/90 dark:from-[#0f172a] dark:via-[#1e293b] dark:to-[#0f172a] shadow-[0_16px_48px_rgba(0,106,255,0.18)] p-3 animate-in fade-in slide-in-from-bottom-2 duration-200"
        >
          <div className="flex items-center justify-between gap-2 mb-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#006aff]">AI Mood</p>
            <button
              type="button"
              onClick={() => setAutoEnabled(!autoEnabled)}
              className={cn(
                'text-[9px] font-bold px-2 py-0.5 rounded-full border transition-colors',
                autoEnabled
                  ? 'bg-[#006aff] text-white border-[#006aff]'
                  : 'bg-transparent text-[var(--muted)] border-[var(--card-border)]'
              )}
            >
              Auto {autoEnabled ? 'ON' : 'OFF'}
            </button>
          </div>
          <div className="grid grid-cols-4 gap-1 max-h-[220px] overflow-y-auto pr-0.5">
            {CHAT_MOODS.map((m) => {
              const Icon = m.icon;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    setMood(m.id);
                    setAutoEnabled(true);
                  }}
                  className={cn(
                    'flex flex-col items-center gap-0.5 p-1.5 rounded-xl border text-center transition-all',
                    mood === m.id
                      ? 'border-[#006aff]/50 bg-[#006aff]/10 text-[#006aff]'
                      : 'border-transparent hover:bg-[#006aff]/5 text-[var(--foreground)]'
                  )}
                  title={m.desc}
                >
                  <Icon className="w-4 h-4 shrink-0" strokeWidth={2} />
                  <span className="text-[8px] font-semibold leading-tight">{m.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <ChatBarTip label={autoEnabled ? `Auto · ${activeMood.label}` : 'AI mood'}>
        <button
          ref={btnRef}
          type="button"
          onClick={() => setOpen(!open)}
          className={cn(
            'xv-chat-mood-btn flex items-center gap-1 rounded-lg font-bold transition-all',
            variant === 'toolbar'
              ? 'px-2 py-1 text-[10px] h-7'
              : 'px-2 py-1.5 text-[10px]',
            autoEnabled
              ? 'bg-gradient-to-r from-[#006aff] to-[#1e40af] text-white shadow-sm ring-1 ring-[#006aff]/40'
              : 'bg-white/5 text-[var(--muted)] hover:bg-white/10 border border-[var(--card-border)]'
          )}
        >
          <WandSparkles className="w-3 h-3 shrink-0" />
          <span>Auto</span>
          {autoEnabled && <ActiveIcon className="w-3 h-3 shrink-0 opacity-90" />}
        </button>
      </ChatBarTip>
    </div>
  );
}
