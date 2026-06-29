'use client';

import { Lightbulb, Sparkles } from 'lucide-react';
import { useTerminalChat } from '@/context/TerminalChatContext';
import { cn } from '@/lib/utils';

export function TerminalFollowUpStrip() {
  const { followUps, loading, setPrompt, submit } = useTerminalChat();

  if (loading || followUps.length === 0) return null;

  function handleSelect(text: string) {
    setPrompt(text);
    void submit(text);
  }

  const refinements = followUps.filter(
    (f) => !/post|social|twitter|linkedin|instagram|share/i.test(f)
  );
  const social = followUps.filter((f) => /post|social|twitter|linkedin|instagram|share/i.test(f));

  return (
    <div className="mb-2 rounded-xl border border-[var(--card-border)] bg-[var(--card)]/90 backdrop-blur-sm px-2.5 py-2 shadow-sm">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)] mb-1.5 flex items-center gap-1.5">
        <Sparkles className="w-3 h-3 text-[#006aff]" />
        Suggestions · refinements · next steps
      </p>

      {refinements.length > 0 && (
        <div className="mb-1.5">
          <p className="text-[9px] font-medium text-[var(--muted)] mb-1 flex items-center gap-1">
            <Lightbulb className="w-3 h-3" />
            Refine your image
          </p>
          <div className="flex flex-wrap gap-1">
            {refinements.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => handleSelect(item)}
                className={cn(
                  'text-[10px] px-2 py-1 rounded-full border border-[#006aff]/30',
                  'bg-[#006aff]/10 hover:bg-[#006aff]/20 text-[#93c5fd] transition-colors'
                )}
              >
                {item}
              </button>
            ))}
          </div>
        </div>
      )}

      {social.length > 0 && (
        <div>
          <p className="text-[9px] font-medium text-[var(--muted)] mb-1">Next steps</p>
          <div className="flex flex-wrap gap-1">
            {social.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => handleSelect(item)}
                className="text-[10px] px-2 py-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 transition-colors"
              >
                {item}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
