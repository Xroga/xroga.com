'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

const PIPELINE_STEPS = [
  { id: 'connect', icon: '📡', label: 'Connecting to Swarm…' },
  { id: 'architect', icon: '🧠', label: 'Architect is planning…' },
  { id: 'builder', icon: '⚙️', label: 'Builder is generating…' },
  { id: 'reviewer', icon: '🔍', label: 'Reviewer is verifying…' },
  { id: 'assemble', icon: '✨', label: 'Assembling final response…' },
] as const;

const AGENT_TO_STEP: Record<string, number> = {
  routing: 0,
  architect: 1,
  builder: 2,
  reviewer: 2,
  qa: 3,
  truth_council: 3,
  complete: 4,
};

interface ProcessingPipelineProps {
  activeAgent?: string | null;
  loading: boolean;
  message?: string;
}

export function ProcessingPipeline({ activeAgent, loading, message }: ProcessingPipelineProps) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!loading) {
      setStep(0);
      return;
    }
    const idx = activeAgent ? (AGENT_TO_STEP[activeAgent] ?? 1) : 0;
    setStep(Math.max(step, idx));
  }, [activeAgent, loading, step]);

  if (!loading) return null;

  return (
    <div className="xv-processing-pipeline my-3 p-3 rounded-xl border border-[#006aff]/25 bg-gradient-to-br from-[#006aff]/10 via-transparent to-violet-500/10">
      <p className="text-[10px] font-bold uppercase tracking-widest text-[#60a5fa] mb-3 flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-[#006aff] animate-pulse" />
        XROGA Swarm · Black Hole V∞
      </p>
      <div className="space-y-2">
        {PIPELINE_STEPS.map((s, i) => {
          const active = i === step;
          const done = i < step;
          const label = active && message ? message : s.label;
          return (
            <div
              key={s.id}
              className={cn(
                'flex items-center gap-2.5 text-[12px] transition-all duration-500',
                active && 'text-[#93c5fd] font-medium',
                done && 'text-emerald-400/80',
                !active && !done && 'text-[var(--muted)] opacity-35'
              )}
            >
              <span className="text-base w-5 text-center">{done ? '✓' : s.icon}</span>
              <span className="flex-1">{label}</span>
              {active && (
                <span className="xv-pipeline-spinner w-3.5 h-3.5 border-2 border-[#006aff]/40 border-t-[#006aff] rounded-full animate-spin" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
