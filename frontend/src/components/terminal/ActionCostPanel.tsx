'use client';

import { useState } from 'react';
import { Zap, ChevronDown, Info } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { useTerminalChat } from '@/context/TerminalChatContext';
import { estimateActionCost, CORE_ACTION_COSTS } from '@/lib/actionCosts';
import { cn } from '@/lib/utils';

export function ActionCostPanel() {
  const actions = useAppStore((s) => s.actions);
  const { prompt } = useTerminalChat();
  const [open, setOpen] = useState(false);
  const remaining = actions?.remaining ?? 50;
  const estimate = estimateActionCost(prompt || 'chat');

  return (
    <div className="relative flex items-center gap-2 text-[10px] sm:text-xs font-terminal">
      <span className="flex items-center gap-1 text-[var(--foreground)]">
        <Zap className="w-3 h-3 text-[var(--accent)]" />
        <span className="font-semibold">{remaining.toLocaleString()}</span>
        <span className="text-[var(--muted)] hidden sm:inline">actions left</span>
      </span>
      <span className="text-[var(--muted)]">|</span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
        className="flex items-center gap-1 text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
      >
        <span>
          Est. <strong className="text-[var(--accent)]">{estimate.cost}</strong> for {estimate.label}
        </span>
        <ChevronDown className={cn('w-3 h-3 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div
          className="absolute bottom-full right-0 mb-2 w-72 max-h-64 overflow-y-auto rounded-xl border border-[var(--card-border)] bg-[var(--card)] backdrop-blur-xl shadow-2xl p-3 z-50"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="text-xs font-semibold flex items-center gap-1.5 mb-2">
            <Info className="w-3.5 h-3.5 text-[var(--accent)]" />
            Action Cost Guide
          </p>
          {estimate.breakdown && (
            <p className="text-[10px] text-[var(--muted)] mb-2 border-b border-[var(--card-border)] pb-2">
              Swarm: {estimate.breakdown.join(' · ')}
            </p>
          )}
          <ul className="space-y-1">
            {CORE_ACTION_COSTS.slice(0, 8).map((item) => (
              <li key={item.id} className="flex justify-between gap-2 text-[10px]">
                <span className="text-[var(--muted)] truncate">{item.task}</span>
                <span className="font-semibold shrink-0">{item.cost}</span>
              </li>
            ))}
          </ul>
          <a href="/dashboard/billing" className="block text-[10px] text-[var(--accent)] mt-2 hover:underline">
            View full pricing →
          </a>
        </div>
      )}
    </div>
  );
}
