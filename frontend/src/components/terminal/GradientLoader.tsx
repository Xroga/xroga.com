'use client';

import { cn } from '@/lib/utils';

export type CouncilLayer = 'elite' | 'reserve' | 'blackhole';

const LAYER_LABEL: Record<CouncilLayer, string> = {
  elite: 'Groq · Gemini · DeepSeek',
  reserve: 'OSS Reserve',
  blackhole: 'Black Hole V∞',
};

interface GradientLoaderProps {
  message?: string;
  layer?: CouncilLayer | null;
  className?: string;
}

/** Modern gradient shimmer + bouncing dots — processing feedback */
export function GradientLoader({ message, layer, className }: GradientLoaderProps) {
  const subtitle = layer ? LAYER_LABEL[layer] : 'Processing Swarm';

  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 py-4 px-4 rounded-2xl border border-white/[0.08] bg-white/[0.02]',
        className
      )}
    >
      <div className="flex flex-col gap-1 min-w-0">
        <span className="text-sm font-mono font-bold bg-gradient-to-r from-amber-400 via-purple-500 to-pink-500 bg-[length:200%_200%] bg-clip-text text-transparent animate-gradient-x">
          ◈ XROGA · {subtitle}
        </span>
        {message && (
          <span className="text-[11px] text-[var(--muted)] truncate xv-swarm-typing">{message}</span>
        )}
      </div>
      <div className="flex space-x-1 shrink-0">
        <span className="w-2 h-2 bg-amber-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
        <span className="w-2 h-2 bg-purple-500 rounded-full animate-bounce [animation-delay:-0.15s]" />
        <span className="w-2 h-2 bg-pink-500 rounded-full animate-bounce" />
      </div>
    </div>
  );
}
