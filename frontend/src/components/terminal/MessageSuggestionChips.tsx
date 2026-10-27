'use client';

import { ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MessageSuggestions } from '@/lib/messageHelpers';
import { BlackHoleMark } from './BlackHoleMark';

interface MessageSuggestionChipsProps {
  suggestions: MessageSuggestions;
  onSelect: (text: string) => void;
  className?: string;
}

export function MessageSuggestionChips({ suggestions, onSelect, className }: MessageSuggestionChipsProps) {
  const { followUps, refine } = suggestions;
  const all = [
    ...followUps.slice(0, 2),
    ...refine.slice(0, 2),
  ].filter((item, index, rows) => rows.indexOf(item) === index);

  if (all.length === 0) return null;

  return (
    <div className={cn('mt-2 xv-suggestions-enter', className)}>
      <p className="xv-suggest-label">
        <span className="xv-suggest-mark"><BlackHoleMark /></span>
        Suggested next steps
      </p>
      <div className="xv-suggest-row">
        {all.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => onSelect(item)}
            className="xv-suggest-chip"
          >
            <span>{item}</span><ArrowUpRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          </button>
        ))}
      </div>
    </div>
  );
}
