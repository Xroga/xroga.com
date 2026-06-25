'use client';

import { useEffect, useState } from 'react';
import { Zap, AlertTriangle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { apiFetch } from '@/lib/utils';
import { cn } from '@/lib/utils';

interface ActionBalance {
  total: number;
  used: number;
  remaining: number;
  planTier: string;
}

export function ActionMeter({ compact = false }: { compact?: boolean }) {
  const [balance, setBalance] = useState<ActionBalance | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const data = await apiFetch('/api/actions/balance', {}, session.access_token);
        setBalance(data);
      } catch {
        // API may be unavailable in dev without credentials
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className={cn('animate-pulse bg-white/5 rounded-xl', compact ? 'h-12' : 'h-24')} />
    );
  }

  if (!balance) {
    return (
      <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4">
        <div className="flex items-center gap-2 text-[var(--muted)]">
          <Zap className="w-4 h-4" />
          <span className="text-sm">Actions: Connect API to view fuel meter</span>
        </div>
      </div>
    );
  }

  const pct = balance.total > 0 ? (balance.remaining / balance.total) * 100 : 0;
  const isLow = pct <= 20;
  const isOut = balance.remaining <= 0;

  return (
    <div className={cn(
      'rounded-xl border bg-[var(--card)]',
      isOut ? 'border-red-500/50' : isLow ? 'border-amber-500/50' : 'border-[var(--card-border)]',
      compact ? 'p-3' : 'p-5'
    )}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Zap className={cn('w-4 h-4', isOut ? 'text-red-400' : 'text-violet-400')} />
          <span className="text-sm font-medium">Action Meter</span>
        </div>
        <span className="text-xs text-[var(--muted)] capitalize">{balance.planTier} plan</span>
      </div>

      <div className="flex items-baseline gap-1 mb-3">
        <span className="text-2xl font-bold">{balance.remaining.toLocaleString()}</span>
        <span className="text-sm text-[var(--muted)]">/ {balance.total.toLocaleString()}</span>
      </div>

      <div className="h-2 bg-white/5 rounded-full overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-500',
            isOut ? 'bg-red-500' : isLow ? 'bg-amber-500' : 'bg-gradient-to-r from-violet-600 to-cyan-500'
          )}
          style={{ width: `${Math.max(pct, 2)}%` }}
        />
      </div>

      {(isLow || isOut) && (
        <div className={cn(
          'flex items-center gap-2 mt-3 text-xs',
          isOut ? 'text-red-400' : 'text-amber-400'
        )}>
          <AlertTriangle className="w-3 h-3" />
          {isOut ? 'Out of Actions – top up to continue' : 'Low Actions – consider upgrading'}
        </div>
      )}
    </div>
  );
}
