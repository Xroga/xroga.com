'use client';

import { useRef, useState } from 'react';
import { ChevronDown, Infinity } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useMoodStore } from '@/store/useMoodStore';
import { usePrivacyStore } from '@/store/usePrivacyStore';
import { ChatBarPortalPopover } from '@/components/ui/ChatBarPortalPopover';

export function BlackHoleVButton({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const autoEnabled = useMoodStore((s) => s.autoEnabled);
  const setAutoEnabled = useMoodStore((s) => s.setAutoEnabled);
  const xrogaAutoMode = usePrivacyStore((s) => s.xrogaAutoMode);
  const setXrogaAutoMode = usePrivacyStore((s) => s.setXrogaAutoMode);
  const confirmationMode = usePrivacyStore((s) => s.confirmationMode);
  const setConfirmationMode = usePrivacyStore((s) => s.setConfirmationMode);

  const autoOn = xrogaAutoMode && autoEnabled;

  return (
    <div className={cn('relative shrink-0', className)}>
      <ChatBarPortalPopover open={open} onClose={() => setOpen(false)} anchorRef={btnRef} width={300}>
        <div className="rounded-2xl border border-[#006aff]/25 bg-[var(--card)] shadow-2xl p-3 animate-in fade-in slide-in-from-bottom-2">
          <div className="flex items-center gap-2 mb-2">
            <Infinity className="w-4 h-4 text-[#006aff]" strokeWidth={2.5} />
            <p className="text-xs font-bold text-[var(--foreground)]">Black Hole V∞</p>
            <span className={cn('ml-auto text-[9px] font-bold px-2 py-0.5 rounded-full', autoOn ? 'bg-[#006aff] text-white' : 'bg-white/10 text-[var(--muted)]')}>
              {autoOn ? 'ON' : 'OFF'}
            </span>
          </div>
          <p className="text-[10px] text-[var(--muted)] leading-relaxed mb-2.5">
            All Xroga AI capabilities — balanced for complex tasks. Background work with manual or auto confirmations.
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
              className={cn('w-9 h-5 rounded-full relative transition-colors', xrogaAutoMode ? 'bg-[#006aff]' : 'bg-white/20')}
            >
              <span className={cn('absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all', xrogaAutoMode ? 'left-4' : 'left-0.5')} />
            </button>
          </div>
          <div className="flex items-center justify-between gap-2 py-1.5 border-t border-[var(--card-border)]/40">
            <span className="text-[10px] font-semibold">Confirmations</span>
            <div className="flex text-[9px] font-bold overflow-hidden rounded-lg border border-[var(--card-border)]">
              <button type="button" onClick={() => setConfirmationMode('manual')} className={cn('px-2 py-1', confirmationMode === 'manual' ? 'bg-[#006aff] text-white' : 'text-[var(--muted)]')}>Manual</button>
              <button type="button" onClick={() => setConfirmationMode('auto')} className={cn('px-2 py-1', confirmationMode === 'auto' ? 'bg-[#006aff] text-white' : 'text-[var(--muted)]')}>Auto</button>
            </div>
          </div>
        </div>
      </ChatBarPortalPopover>

      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-0.5 h-7 px-0 text-[11px] font-bold text-[var(--foreground)] bg-transparent border-0 hover:opacity-80 transition-opacity"
      >
        <Infinity className="w-3.5 h-3.5 shrink-0 text-[#006aff]" strokeWidth={2.5} />
        <span>Black Hole V</span>
        <ChevronDown className={cn('w-3 h-3 opacity-50 transition-transform', open && 'rotate-180')} />
      </button>
    </div>
  );
}
