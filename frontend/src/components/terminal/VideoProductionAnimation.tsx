'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { Film, Brain, Shield, Wand2, Music, Scissors, Sparkles } from 'lucide-react';

const OMNI_STEPS = [
  { id: 'scripting', label: 'Trinity Brain', icon: Brain, phases: ['trinity_scripting', 'storyboard_ready', 'characters'] },
  { id: 'rendering', label: 'Swarm Render', icon: Film, phases: ['scene_render', 'qc_inspect', 'groq_patch', 'tool_swap', 'deepseek_simplify', 'parallax_fallback'] },
  { id: 'audio', label: 'Audio Studio', icon: Music, phases: ['audio_compose'] },
  { id: 'assembling', label: 'Final Cut', icon: Scissors, phases: ['stitch_assemble', 'postproduction'] },
  { id: 'complete', label: 'Ready', icon: Sparkles, phases: ['complete'] },
] as const;

const PHASE_LABELS: Record<string, string> = {
  trinity_scripting: 'DeepSeek writing Hollywood storyboard…',
  storyboard_ready: 'Storyboard locked — continuity set',
  characters: 'Designing characters & keyframes',
  scene_render: 'Rendering cinematic scene',
  qc_inspect: 'QC shield — inspecting every frame',
  groq_patch: 'Groq reflex patch — fixing defects',
  tool_swap: 'Swapping render engine (80/20 vault)',
  deepseek_simplify: 'DeepSeek simplifying shot complexity',
  parallax_fallback: '2.5D parallax cinematic transition',
  audio_compose: 'ElevenLabs voiceover & cinematic score',
  stitch_assemble: 'FFmpeg assembling final cut',
  postproduction: 'Hollywood polish pass',
  complete: 'Your film is ready',
  scripting: 'Planning your scene',
  rendering: 'Rendering video',
  audio: 'Adding audio',
  assembling: 'Assembling final cut',
};

interface VideoProductionAnimationProps {
  className?: string;
  message?: string;
  step?: string;
  omniPhase?: string | null;
  sublabel?: string;
}

export function VideoProductionAnimation({
  className,
  message,
  step,
  omniPhase,
  sublabel,
}: VideoProductionAnimationProps) {
  const [dots, setDots] = useState('');

  useEffect(() => {
    const t = setInterval(() => setDots((d) => (d.length >= 3 ? '' : `${d}.`)), 450);
    return () => clearInterval(t);
  }, []);

  const activePhase = omniPhase ?? step ?? 'scripting';
  const activeStepIdx = OMNI_STEPS.findIndex((s) =>
    (s.phases as readonly string[]).includes(activePhase) || s.id === activePhase
  );
  const stepIdx = activeStepIdx >= 0 ? activeStepIdx : 0;

  const displayLabel =
    message ?? PHASE_LABELS[activePhase] ?? PHASE_LABELS[step ?? ''] ?? 'Omni-Reality production in progress';

  return (
    <div
      className={cn(
        'rounded-2xl border border-[#006aff]/25 bg-gradient-to-br from-[#006aff]/8 via-[#0a0a14] to-[#1a0a2e]/40 p-4 sm:p-5 overflow-hidden relative',
        className,
      )}
    >
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(0,106,255,0.12),transparent_60%)] pointer-events-none" />
      <div className="relative flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#006aff]/15 border border-[#006aff]/30">
            <Wand2 className="h-4 w-4 text-[#60a5fa]" />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#60a5fa]/80">Omni-Reality Studio</p>
            <p className="text-xs text-[var(--muted)]">Marvel-grade production pipeline</p>
          </div>
        </div>

        <p className="text-sm font-medium text-[var(--foreground)] text-center xv-swarm-typing">
          {displayLabel}
          <span className="inline-block w-4 text-left text-[#60a5fa]">{dots}</span>
        </p>

        <div className="grid grid-cols-5 gap-1">
          {OMNI_STEPS.map((s, i) => {
            const Icon = s.id === 'rendering' && activePhase === 'qc_inspect' ? Shield : s.icon;
            const active = i <= stepIdx;
            const current = i === stepIdx;
            return (
              <div key={s.id} className="flex flex-col items-center gap-1">
                <div
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-lg border transition-all duration-500',
                    current && 'border-[#006aff] bg-[#006aff]/20 scale-110 shadow-[0_0_12px_rgba(0,106,255,0.35)]',
                    active && !current && 'border-[#006aff]/40 bg-[#006aff]/10',
                    !active && 'border-[var(--card-border)] bg-[var(--muted)]/5 opacity-50',
                  )}
                >
                  <Icon className={cn('h-3.5 w-3.5', active ? 'text-[#60a5fa]' : 'text-[var(--muted)]')} />
                </div>
                <span className={cn('text-[8px] font-semibold text-center leading-tight', active ? 'text-[#60a5fa]' : 'text-[var(--muted)]')}>
                  {s.label}
                </span>
              </div>
            );
          })}
        </div>

        <div className="h-1 rounded-full bg-[#006aff]/10 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-[#006aff] to-[#60a5fa] transition-all duration-700 rounded-full"
            style={{ width: `${Math.min(100, ((stepIdx + 1) / OMNI_STEPS.length) * 100)}%` }}
          />
        </div>

        {sublabel && <p className="text-[10px] text-center text-[var(--muted)]">{sublabel}</p>}
      </div>
    </div>
  );
}
