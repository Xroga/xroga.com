'use client';

import { Globe, Smartphone, Gamepad2, Code2, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';

const METRICS = [
  { icon: Globe, label: 'Websites', color: 'from-blue-500/20 to-cyan-500/10' },
  { icon: Smartphone, label: 'Mobile Apps', color: 'from-violet-500/20 to-purple-500/10' },
  { icon: Gamepad2, label: 'Games', color: 'from-emerald-500/20 to-teal-500/10' },
  { icon: Code2, label: 'Software', color: 'from-amber-500/20 to-orange-500/10' },
];

interface CompactAnalyticsProps {
  compact?: boolean;
  className?: string;
}

export function CompactAnalytics({ compact, className }: CompactAnalyticsProps) {
  return (
    <div className={cn('space-y-3', className)}>
      {!compact && (
        <div className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-[var(--accent)]" />
          <h2 className="font-semibold text-sm">Analytics</h2>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--accent)]/15 text-[var(--accent)] font-medium">
            Live when deployed
          </span>
        </div>
      )}
      <div className={cn('grid gap-2', compact ? 'grid-cols-2 sm:grid-cols-4' : 'sm:grid-cols-2 lg:grid-cols-4')}>
        {METRICS.map(({ icon: Icon, label, color }, i) => (
          <div
            key={label}
            className={cn(
              'xv-analytics-card rounded-xl p-3 border border-[var(--card-border)] bg-gradient-to-br',
              color,
              'universe-float'
            )}
            style={{ animationDelay: `${i * 0.15}s` }}
          >
            <Icon className="w-4 h-4 text-[var(--accent)] mb-1.5" />
            <p className="text-xs font-semibold">{label}</p>
            <div className="mt-2 space-y-0.5">
              <div className="flex justify-between text-[10px] text-[var(--muted)]">
                <span>Views</span>
                <span className="font-mono">—</span>
              </div>
              <div className="flex justify-between text-[10px] text-[var(--muted)]">
                <span>Builds</span>
                <span className="font-mono">0</span>
              </div>
              <div className="h-1 rounded-full bg-white/10 mt-1 overflow-hidden">
                <div className="h-full w-0 bg-[var(--accent)] rounded-full xv-analytics-bar" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
