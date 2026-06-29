'use client';

import { Lightbulb, Rocket } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MessageSuggestions } from '@/lib/messageHelpers';

interface MessageSuggestionChipsProps {
  suggestions: MessageSuggestions;
  onSelect: (text: string) => void;
  className?: string;
}

export function MessageSuggestionChips({ suggestions, onSelect, className }: MessageSuggestionChipsProps) {
  const { deploy, followUps, refine, creationLabel } = suggestions;

  return (
    <div className={cn('mt-3 space-y-3 xv-suggestions-enter', className)}>
      {deploy.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)] mb-1.5 flex items-center gap-1.5">
            <Rocket className="w-3 h-3 text-[#006aff]" />
            Deploy {creationLabel}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {deploy.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => onSelect(d.prompt)}
                className="px-2.5 py-1.5 rounded-lg text-[10px] font-semibold border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                <span className="opacity-60 font-normal">{d.platform} ·</span> {d.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {followUps.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)] mb-1.5">
            Next steps
          </p>
          <div className="flex flex-wrap gap-1.5">
            {followUps.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => onSelect(q)}
                className="px-2.5 py-1 rounded-full text-[10px] font-medium border border-[#006aff]/30 bg-[#006aff]/10 text-[#93c5fd] hover:bg-[#006aff]/20 transition-colors"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {refine.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)] mb-1.5">
            Refine
          </p>
          <div className="flex flex-wrap gap-1.5">
            {refine.map((idea) => (
              <button
                key={idea}
                type="button"
                onClick={() => onSelect(idea)}
                className="px-2.5 py-1 rounded-full text-[10px] font-medium border border-[var(--card-border)] bg-white/5 text-[var(--foreground)]/80 hover:bg-white/10 transition-colors inline-flex items-center gap-1"
              >
                <Lightbulb className="w-3 h-3 text-[#006aff]" />
                {idea}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
