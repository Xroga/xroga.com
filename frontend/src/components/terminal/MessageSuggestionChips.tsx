'use client';

import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MessageSuggestions } from '@/lib/messageHelpers';

interface MessageSuggestionChipsProps {
  suggestions: MessageSuggestions;
  onSelect: (text: string) => void;
  className?: string;
}

export function MessageSuggestionChips({ suggestions, onSelect, className }: MessageSuggestionChipsProps) {
  const { followUps, refine } = suggestions;
  const all = [
    ...followUps.map((q) => ({ key: q, text: q, label: q, tone: 'next' as const })),
    ...refine.map((idea) => ({ key: idea, text: idea, label: idea, tone: 'refine' as const })),
  ];

  if (all.length === 0) return null;

  return (
    <div className={cn('mt-2 xv-suggestions-enter', className)}>
      <p className="text-[9px] font-semibold uppercase tracking-wider text-[var(--muted)] mb-1 flex items-center gap-1">
        <Sparkles className="w-3 h-3 text-[var(--accent)]" />
        Suggested next steps
      </p>
      <div className="flex flex-wrap gap-1">
        {all.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => onSelect(item.text)}
            className={cn(
              'text-[9px] px-2 py-0.5 rounded-full border font-medium transition-colors',
              item.tone === 'next' && 'border-[var(--accent)]/30 bg-[var(--accent)]/10 text-[var(--foreground)]',
              item.tone === 'refine' && 'border-[var(--card-border)] bg-[var(--background)]/50 text-[var(--foreground)]/85'
            )}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}
