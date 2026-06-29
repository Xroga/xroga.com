'use client';

import { useId, useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

const STEP_ORDER = [
  'scripting',
  'characters',
  'storyboard',
  'rendering',
  'audio',
  'assembling',
  'postproduction',
  'complete',
] as const;

const STEP_LABELS: Record<string, string> = {
  scripting: '📝 Writing screenplay…',
  characters: '🎭 Designing characters…',
  storyboard: '🎬 Storyboarding scenes…',
  rendering: '🎥 Rendering scenes…',
  audio: '🎙️ Composing audio…',
  assembling: '✂️ Assembling final cut…',
  postproduction: '🎨 Post-production polish…',
  complete: '🎉 Your film is ready!',
};

/** Film reel animation for movie / video production */
export function FilmGeneratingAnimation({
  className,
  label,
  sublabel = 'Xroga AI · Film Studio',
  step,
  message,
}: {
  className?: string;
  label?: string;
  sublabel?: string;
  step?: string;
  message?: string;
}) {
  const clipId = useId().replace(/:/g, '');
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    if (step) {
      const idx = STEP_ORDER.indexOf(step as (typeof STEP_ORDER)[number]);
      if (idx >= 0) setActiveStep(idx);
      return;
    }
    const timer = setInterval(() => {
      setActiveStep((s) => (s + 1) % STEP_ORDER.length);
    }, 3200);
    return () => clearInterval(timer);
  }, [step]);

  const displayLabel =
    message ?? label ?? STEP_LABELS[step ?? STEP_ORDER[activeStep]] ?? 'Producing your film';

  return (
    <div
      className={cn(
        'xv-image-gen-card relative overflow-hidden rounded-2xl border border-purple-500/25 bg-gradient-to-br from-purple-950/30 via-[#0a0a12] to-[#006aff]/10 p-6',
        className
      )}
    >
      <div className="relative flex flex-col items-center justify-center gap-5 min-h-[240px]">
        <div className="xv-film-reel text-purple-400">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" className="w-28 h-28 animate-spin" style={{ animationDuration: '4s' }} aria-hidden>
            <defs>
              <clipPath id={`reel-${clipId}`}>
                <circle cx="60" cy="60" r="50" />
              </clipPath>
            </defs>
            <circle cx="60" cy="60" r="54" fill="none" stroke="currentColor" strokeWidth="3" opacity="0.3" />
            <circle cx="60" cy="60" r="40" fill="none" stroke="currentColor" strokeWidth="2" />
            {[0, 60, 120, 180, 240, 300].map((angle) => (
              <circle
                key={angle}
                cx={60 + 28 * Math.cos((angle * Math.PI) / 180)}
                cy={60 + 28 * Math.sin((angle * Math.PI) / 180)}
                r="6"
                fill="currentColor"
                opacity="0.7"
              />
            ))}
            <circle cx="60" cy="60" r="10" fill="currentColor" />
            <text x="60" y="64" textAnchor="middle" fontSize="7" fontWeight="700" fill="white" fontFamily="system-ui">
              XROGA
            </text>
          </svg>
        </div>
        <div className="text-center space-y-2">
          <p className="text-sm font-semibold text-[var(--foreground)] animate-in fade-in duration-300">
            {displayLabel}
          </p>
          <div className="flex items-center justify-center gap-1 flex-wrap max-w-xs">
            {STEP_ORDER.map((s, i) => (
              <span
                key={s}
                className={cn(
                  'h-1 rounded-full transition-all duration-500',
                  i <= activeStep ? 'w-3 bg-purple-500' : 'w-1 bg-purple-500/25'
                )}
              />
            ))}
          </div>
          <p className="text-[11px] text-[var(--muted)]">{sublabel}</p>
        </div>
      </div>
    </div>
  );
}
