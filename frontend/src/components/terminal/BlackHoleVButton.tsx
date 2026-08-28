'use client';

import { useState } from 'react';
import { Infinity, ChevronDown, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ChatBarPortalPopover } from '@/components/ui/ChatBarPortalPopover';
import { useRef } from 'react';

/** Compact explanation of Xroga's capability orchestration and approval boundary. */
export function BlackHoleVButton({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  return (
    <div className={cn('relative shrink-0', className)}>
      <ChatBarPortalPopover open={open} onClose={() => setOpen(false)} anchorRef={btnRef} width={300}>
        <div className="rounded-2xl border border-[#006aff]/25 bg-[var(--card)] shadow-2xl p-3 animate-in fade-in slide-in-from-bottom-2">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-bold font-azurio text-[var(--foreground)]">Black Hole V</span>
            <Infinity className="w-4 h-4 text-[#006aff]" strokeWidth={2.5} />
            <span className="ml-auto text-[9px] font-bold px-2 py-0.5 rounded-full bg-[#006aff] text-white">
              ON
            </span>
          </div>
          <p className="text-[10px] text-[var(--muted)] leading-relaxed mb-2.5">
            Our first and last model — every update ships in this one model. All Xroga AI capabilities, balanced for complex tasks.
          </p>
          <div className="flex items-center gap-2 py-1.5 opacity-90">
            <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-500" />
            <span className="text-[10px] font-semibold">Safe tasks can continue automatically</span>
          </div>
          <p className="text-[9px] text-[var(--muted)] mb-2">
            Production, destructive, paid, or irreversible actions remain blocked until the required approval is recorded.
          </p>
          <div className="flex items-center justify-between gap-2 py-1.5">
            <span className="text-[10px] font-semibold">Sensitive-action approvals</span>
            <span className="rounded-lg border border-[var(--card-border)] px-2 py-1 text-[9px] font-bold text-[var(--muted)]">Required</span>
          </div>
        </div>
      </ChatBarPortalPopover>

      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          'flex items-center gap-0.5 px-0 py-0.5 bg-transparent border-0 font-remixa font-semibold text-[var(--foreground)] hover:text-[#006aff] transition-colors',
          compact ? 'text-[9px] sm:text-[10px]' : 'text-[10px] sm:text-[11px]'
        )}
        title="Black Hole V∞"
        aria-label="Black Hole V infinity"
        aria-expanded={open}
      >
        {compact ? (
          <span className="font-azurio font-bold whitespace-nowrap flex items-center gap-0.5">
            <span>Black Hole</span>
            <span className="inline-flex items-center gap-px text-[#006aff]">
              V
              <Infinity className="w-3 h-3 shrink-0" strokeWidth={2.5} />
            </span>
          </span>
        ) : (
          <>
            <span className="font-azurio font-bold">Black Hole</span>
            <span className="font-azurio font-bold">V</span>
            <Infinity className="w-3.5 h-3.5 shrink-0 text-[#006aff]" strokeWidth={2.5} />
            <span className="text-[8px] font-remixa font-bold text-[#006aff] ml-0.5">ON</span>
          </>
        )}
        <ChevronDown className={cn('w-3 h-3 opacity-45 transition-transform shrink-0', open && 'rotate-180')} />
      </button>
    </div>
  );
}
