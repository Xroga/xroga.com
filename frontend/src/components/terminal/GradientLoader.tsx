'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

export type CouncilLayer = 'elite' | 'reserve' | 'blackhole';

const LAYER_LABEL: Record<CouncilLayer, string> = {
  elite: 'Black Hole V∞',
  reserve: 'Reserve Swarm',
  blackhole: 'Black Hole V∞',
};

const CHAT_STEPS = [
  'Understanding your question',
  'Searching knowledge',
  'Composing answer',
  'Final polish',
] as const;

interface GradientLoaderProps {
  message?: string;
  layer?: CouncilLayer | null;
  className?: string;
}

/** Modern processing animation for any chat question */
export function GradientLoader({ message, layer, className }: GradientLoaderProps) {
  const subtitle = layer ? LAYER_LABEL[layer] : 'Black Hole V∞';
  const [step, setStep] = useState(0);
  const [dots, setDots] = useState('');

  useEffect(() => {
    const t = setInterval(() => setStep((s) => (s + 1) % CHAT_STEPS.length), 2200);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const t = setInterval(() => setDots((d) => (d.length >= 3 ? '' : `${d}.`)), 420);
    return () => clearInterval(t);
  }, []);

  const display = message ?? CHAT_STEPS[step];

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl border border-[#006aff]/20',
        'bg-gradient-to-br from-[#006aff]/8 via-[#0a0a12]/80 to-purple-900/10 p-4',
        className
      )}
    >
      <div
        className="pointer-events-none absolute -top-8 -right-8 h-24 w-24 rounded-full bg-[#006aff]/20 blur-2xl xv-orbit-glow"
        aria-hidden
      />
      <div className="flex items-center gap-4">
        <div className="relative h-11 w-11 shrink-0" aria-hidden>
          <span className="absolute inset-0 rounded-full border border-[#006aff]/30 xv-orbit-spin" />
          <span className="absolute inset-[3px] rounded-full border border-purple-500/25 xv-orbit-spin-reverse" />
          <span className="absolute inset-[10px] rounded-full bg-black border border-amber-400/50 shadow-[0_0_10px_rgba(251,191,36,0.35)]" />
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[#60a5fa]/90">
            XROGA AI · {subtitle}
          </p>
          <p className="mt-0.5 truncate text-sm font-medium text-[var(--foreground)] xv-swarm-typing">
            {display}
            <span className="inline-block w-4 text-left text-[#60a5fa]">{dots}</span>
          </p>
          <div className="mt-2 flex items-center gap-1">
            {CHAT_STEPS.map((_, i) => (
              <span
                key={i}
                className={cn(
                  'h-1 rounded-full transition-all duration-500',
                  i <= step ? 'w-5 bg-[#006aff]' : 'w-1.5 bg-[#006aff]/20'
                )}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
