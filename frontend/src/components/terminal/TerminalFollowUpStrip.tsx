'use client';

import { Sparkles } from 'lucide-react';
import { useTerminalChat } from '@/context/TerminalChatContext';
import { cn } from '@/lib/utils';

export function TerminalFollowUpStrip({
  className,
  items,
}: {
  className?: string;
  items?: string[];
}) {
  const { followUps, loading, setPrompt, submit } = useTerminalChat();
  const chips = (items?.length ? items : followUps).filter(Boolean);

  if (loading || chips.length === 0) return null;

  function handleSelect(text: string) {
    setPrompt(text);
    void submit(text);
  }

  const refinements = chips.filter(
    (f) => !/post|social|twitter|linkedin|instagram|share|deploy|cdn|r2|upload to/i.test(f)
  );

  if (refinements.length === 0) return null;

  return (
    <div className={cn('xv-refine-strip', className)}>
      <div className="flex items-center gap-1.5 mb-1.5 min-w-0">
        <Sparkles className="w-3 h-3 text-[var(--accent)] shrink-0" />
        <span className="text-[9px] font-semibold uppercase tracking-wider text-[var(--muted)] truncate">
          Refine your image
        </span>
      </div>
      <div className="flex flex-wrap gap-1">
        {refinements.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => handleSelect(item)}
            className="xv-refine-chip"
          >
            {item}
          </button>
        ))}
      </div>
    </div>
  );
}
