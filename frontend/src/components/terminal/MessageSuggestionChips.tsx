'use client';

import { cn } from '@/lib/utils';
import type { MessageSuggestions } from '@/lib/messageHelpers';

interface MessageSuggestionChipsProps {
  suggestions: MessageSuggestions;
  onSelect: (text: string) => void;
  className?: string;
}

export function MessageSuggestionChips({ suggestions, onSelect, className }: MessageSuggestionChipsProps) {
  return (
    <div className={cn('mt-3 space-y-2', className)}>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">
        Quick follow-ups
      </p>
      <div className="flex flex-wrap gap-1.5">
        {suggestions.yesNo.map((q) => (
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
      <div className="flex flex-wrap gap-1.5">
        {suggestions.ideas.map((idea) => (
          <button
            key={idea}
            type="button"
            onClick={() => onSelect(idea)}
            className="px-2.5 py-1 rounded-full text-[10px] font-medium border border-[var(--card-border)] bg-white/5 text-[var(--foreground)]/80 hover:bg-white/10 transition-colors"
          >
            💡 {idea}
          </button>
        ))}
      </div>
    </div>
  );
}
