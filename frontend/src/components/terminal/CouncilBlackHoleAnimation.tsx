'use client';

import { cn } from '@/lib/utils';

export type CouncilLayer = 'elite' | 'reserve' | 'blackhole';

interface CouncilBlackHoleAnimationProps {
  layer?: CouncilLayer;
  message?: string;
  className?: string;
}

const COUNCIL_ORBS = [
  { id: 'groq', label: 'Groq', color: 'bg-amber-400 shadow-amber-400/50' },
  { id: 'gemini', label: 'Gemini', color: 'bg-sky-400 shadow-sky-400/50' },
  { id: 'deepseek', label: 'DeepSeek', color: 'bg-orange-500 shadow-orange-500/50' },
] as const;

/** Visualize Elite Council or OSS Reserve converging into Black Hole V∞ */
export function CouncilBlackHoleAnimation({ layer = 'elite', message, className }: CouncilBlackHoleAnimationProps) {
  const isReserve = layer === 'reserve';
  const isBlackhole = layer === 'blackhole';

  return (
    <div
      className={cn(
        'rounded-2xl border border-[#006aff]/20 bg-gradient-to-br from-[#006aff]/6 via-[#0a0a12] to-purple-900/10 p-4',
        isBlackhole && 'ring-1 ring-amber-500/30',
        className
      )}
    >
      <div className="flex flex-col items-center gap-3 min-h-[88px] justify-center">
        {isReserve ? (
          <div className="relative w-full max-w-[200px] h-16 flex items-center justify-center">
            {Array.from({ length: 24 }).map((_, i) => (
              <span
                key={i}
                className="absolute w-1 h-1 rounded-full bg-emerald-400/80 animate-pulse"
                style={{
                  left: `${50 + 38 * Math.cos((i / 24) * Math.PI * 2)}%`,
                  top: `${50 + 38 * Math.sin((i / 24) * Math.PI * 2)}%`,
                  animationDelay: `${i * 80}ms`,
                }}
              />
            ))}
            <span className="relative z-10 w-3 h-3 rounded-full bg-black border border-emerald-400/60" />
          </div>
        ) : (
          <div className="flex items-center justify-center gap-4">
            {COUNCIL_ORBS.map((orb, i) => (
              <div key={orb.id} className="flex flex-col items-center gap-1">
                <span
                  className={cn(
                    'w-3 h-3 rounded-full shadow-lg animate-pulse',
                    orb.color
                  )}
                  style={{ animationDelay: `${i * 200}ms` }}
                />
                <span className="text-[8px] text-[var(--muted)] uppercase tracking-wider">{orb.label}</span>
              </div>
            ))}
            <span className="text-[var(--muted)] text-xs mx-1">→</span>
            <span
              className={cn(
                'w-4 h-4 rounded-full bg-black border-2',
                isBlackhole ? 'border-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.5)]' : 'border-[#006aff]/40'
              )}
            />
          </div>
        )}

        <p className="text-[11px] text-center text-[var(--foreground)]/90 font-medium xv-swarm-typing">
          {message ??
            (isBlackhole
              ? 'Black Hole V∞ — compressing into final truth'
              : isReserve
                ? 'OSS Reserve Army — emergency fallback'
                : 'Elite Council — Groq · Gemini · DeepSeek')}
        </p>
      </div>
    </div>
  );
}
