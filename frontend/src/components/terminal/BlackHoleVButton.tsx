'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Infinity } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CHAT_MOODS, useMoodStore } from '@/store/useMoodStore';
import { usePrivacyStore } from '@/store/usePrivacyStore';
import { ChatBarTip } from '@/components/ui/ChatBarTip';

export function BlackHoleVButton({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const autoEnabled = useMoodStore((s) => s.autoEnabled);
  const mood = useMoodStore((s) => s.mood);
  const setAutoEnabled = useMoodStore((s) => s.setAutoEnabled);
  const setMood = useMoodStore((s) => s.setMood);
  const xrogaAutoMode = usePrivacyStore((s) => s.xrogaAutoMode);
  const setXrogaAutoMode = usePrivacyStore((s) => s.setXrogaAutoMode);
  const confirmationMode = usePrivacyStore((s) => s.confirmationMode);
  const setConfirmationMode = usePrivacyStore((s) => s.setConfirmationMode);

  const activeMood = CHAT_MOODS.find((m) => m.id === mood) ?? CHAT_MOODS[6];
  const ActiveIcon = activeMood.icon;
  const autoOn = xrogaAutoMode && autoEnabled;

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (btnRef.current?.contains(t)) return;
      const pop = document.getElementById('xv-blackhole-v-popup');
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
          id="xv-blackhole-v-popup"
          className="absolute bottom-full left-0 mb-2 z-[95] w-[min(320px,calc(100vw-32px))] rounded-2xl border border-[#006aff]/25 bg-[var(--card)] shadow-2xl p-3 animate-in fade-in slide-in-from-bottom-2"
        >
          <div className="flex items-center gap-2 mb-2">
            <Infinity className="w-4 h-4 text-[#006aff]" strokeWidth={2.5} />
            <p className="text-xs font-bold text-[var(--foreground)]">Black Hole V∞</p>
            <span className={cn('ml-auto text-[9px] font-bold px-2 py-0.5 rounded-full', autoOn ? 'bg-[#006aff] text-white' : 'bg-white/10 text-[var(--muted)]')}>
              {autoOn ? 'AUTO ON' : 'AUTO OFF'}
            </span>
          </div>
          <p className="text-[10px] text-[var(--muted)] leading-relaxed mb-2.5">
            All Xroga AI capabilities — balanced for complex tasks. Work continues in background with your confirmations (or auto-confirm when enabled).
          </p>
          <div className="flex items-center justify-between gap-2 py-1.5 border-t border-[var(--card-border)]/40">
            <span className="text-[10px] font-semibold">Auto mode</span>
            <button
              type="button"
              onClick={() => {
                const next = !xrogaAutoMode;
                setXrogaAutoMode(next);
                setAutoEnabled(next);
              }}
              className={cn('w-9 h-5 rounded-full transition-colors relative', xrogaAutoMode ? 'bg-[#006aff]' : 'bg-white/20')}
            >
              <span className={cn('absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all', xrogaAutoMode ? 'left-4' : 'left-0.5')} />
            </button>
          </div>
          <div className="flex items-center justify-between gap-2 py-1.5 border-t border-[var(--card-border)]/40">
            <span className="text-[10px] font-semibold">Confirmations</span>
            <div className="flex rounded-lg border border-[var(--card-border)] overflow-hidden text-[9px] font-bold">
              <button
                type="button"
                onClick={() => setConfirmationMode('manual')}
                className={cn('px-2 py-1', confirmationMode === 'manual' ? 'bg-[#006aff] text-white' : 'text-[var(--muted)]')}
              >
                Manual
              </button>
              <button
                type="button"
                onClick={() => setConfirmationMode('auto')}
                className={cn('px-2 py-1', confirmationMode === 'auto' ? 'bg-[#006aff] text-white' : 'text-[var(--muted)]')}
              >
                Auto
              </button>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-1 mt-2 max-h-[140px] overflow-y-auto">
            {CHAT_MOODS.slice(0, 8).map((m) => {
              const Icon = m.icon;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => { setMood(m.id); setAutoEnabled(true); setXrogaAutoMode(true); }}
                  className={cn(
                    'flex flex-col items-center gap-0.5 p-1 rounded-lg text-[8px] font-semibold',
                    mood === m.id ? 'bg-[#006aff]/15 text-[#006aff]' : 'hover:bg-white/5 text-[var(--muted)]'
                  )}
                  title={m.desc}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {m.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <ChatBarTip label={autoOn ? `Black Hole V∞ · ${activeMood.label}` : 'Black Hole V∞'}>
        <button
          ref={btnRef}
          type="button"
          onClick={() => setOpen(!open)}
          className={cn(
            'flex items-center gap-1 rounded-lg font-bold h-7 px-2 text-[10px] border transition-all',
            autoOn
              ? 'bg-gradient-to-r from-[#006aff] to-[#1e3a8a] text-white border-[#006aff]/50'
              : 'bg-white/5 text-[var(--muted)] border-[var(--card-border)] hover:bg-white/10'
          )}
        >
          <Infinity className="w-3.5 h-3.5 shrink-0" strokeWidth={2.5} />
          <span className="font-black tracking-tight">V</span>
          {autoOn && <ActiveIcon className="w-3 h-3 opacity-90" />}
          <ChevronDown className="w-3 h-3 opacity-60" />
        </button>
      </ChatBarTip>
    </div>
  );
}
