'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

const IMAGE_STEPS = ['classifying', 'enhancing', 'painting', 'reviewing', 'complete'] as const;

const IMAGE_LABELS: Record<string, string> = {
  classifying: 'Understanding your request',
  enhancing: 'Enhancing your prompt',
  painting: 'Generating your image',
  reviewing: 'Final touches',
  upscaling: 'Final touches',
  complete: 'Image ready',
};

const VIDEO_STEPS = ['scripting', 'rendering', 'audio', 'assembling', 'complete'] as const;

const VIDEO_LABELS: Record<string, string> = {
  scripting: 'Planning your scene',
  rendering: 'Rendering video',
  audio: 'Adding audio',
  assembling: 'Assembling final cut',
  postproduction: 'Polishing output',
  complete: 'Video ready',
};

/** Simple text progress — no pencil / reel icons */
export function TextGeneratingAnimation({
  className,
  message,
  step,
  mode = 'image',
  sublabel,
}: {
  className?: string;
  message?: string;
  step?: string;
  mode?: 'image' | 'video';
  sublabel?: string;
}) {
  const steps = mode === 'video' ? VIDEO_STEPS : IMAGE_STEPS;
  const labels = mode === 'video' ? VIDEO_LABELS : IMAGE_LABELS;
  const [dots, setDots] = useState('');
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    const dotTimer = setInterval(() => {
      setDots((d) => (d.length >= 3 ? '' : `${d}.`));
    }, 450);
    return () => clearInterval(dotTimer);
  }, []);

  useEffect(() => {
    if (step) {
      const idx = (steps as readonly string[]).indexOf(step);
      if (idx >= 0) setActiveStep(idx);
      return;
    }
    const timer = setInterval(() => {
      setActiveStep((s) => (s + 1) % steps.length);
    }, 2800);
    return () => clearInterval(timer);
  }, [step, steps]);

  const displayLabel =
    message ?? labels[step ?? steps[activeStep]] ?? (mode === 'video' ? 'Generating your video' : 'Generating your image');

  return (
    <div
      className={cn(
        'rounded-2xl border border-[#006aff]/20 bg-gradient-to-br from-[#006aff]/6 via-[#0a0a12] to-transparent p-5',
        className
      )}
    >
      <div className="flex flex-col items-center justify-center gap-3 min-h-[100px] text-center">
        <p className="text-sm font-medium text-[var(--foreground)] xv-swarm-typing">
          {displayLabel}
          <span className="inline-block w-4 text-left text-[#60a5fa]">{dots}</span>
        </p>
        <div className="flex items-center justify-center gap-1.5 flex-wrap max-w-xs">
          {steps.map((s, i) => (
            <span
              key={s}
              className={cn(
                'h-1 rounded-full transition-all duration-500',
                i <= activeStep ? 'w-4 bg-[#006aff]' : 'w-1.5 bg-[#006aff]/20'
              )}
            />
          ))}
        </div>
        {sublabel && <p className="text-[11px] text-[var(--muted)]">{sublabel}</p>}
      </div>
    </div>
  );
}
