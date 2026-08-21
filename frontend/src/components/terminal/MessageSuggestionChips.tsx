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
      <p className="xv-suggest-label">
        <Sparkles className="w-3 h-3" />
        Suggested next steps
      </p>
      <div className="xv-suggest-row">
        {all.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => onSelect(item.text)}
            className={cn('xv-suggest-chip', item.tone === 'next' && 'is-next')}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}
