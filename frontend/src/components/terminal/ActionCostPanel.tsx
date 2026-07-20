'use client';

import { Brain } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { useTerminalChat } from '@/context/TerminalChatContext';
import { cn } from '@/lib/utils';

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toLocaleString();
}

export function ActionCostPanel() {
  const usage = useAppStore((s) => s.tokenUsage);
  const { prompt } = useTerminalChat();
  const remaining = usage?.totalTokensRemaining ?? 6_172_222;
  const total = usage?.totalLimit ?? 6_172_222;
  const pct = total > 0 ? Math.round((remaining / total) * 100) : 100;

  return (
    <div className="relative flex items-center gap-2 text-[10px] sm:text-xs font-terminal">
      <span className="flex items-center gap-1 text-[var(--foreground)]">
        <Brain className="w-3 h-3 text-[var(--accent)]" />
        <span className="font-semibold tabular-nums">{formatTokens(remaining)}</span>
        <span className="text-[var(--muted)] hidden sm:inline">tokens left</span>
      </span>
      <span className="text-[var(--muted)]">|</span>
      <span className="text-[var(--muted)]">
        Xroga AI Brain · {pct}% remaining
        {prompt.trim() ? '' : ''}
      </span>
      <div className="hidden sm:block w-16 h-1 rounded-full bg-white/10 overflow-hidden ml-1">
        <div
          className={cn('h-full rounded-full bg-gradient-to-r from-[var(--accent)] to-violet-500')}
          style={{ width: `${Math.max(pct, 4)}%` }}
        />
      </div>
    </div>
  );
}
