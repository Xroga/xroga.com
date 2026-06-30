'use client';

import { ShieldAlert, Sparkles, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ImageBlockedOutput } from '@/lib/imageSafetyMessages';
import { useTerminalChat } from '@/context/TerminalChatContext';

export function ImageBlockedCard({
  data,
  className,
  messageId,
  onDelete,
}: {
  data: ImageBlockedOutput;
  className?: string;
  messageId?: string;
  onDelete?: () => void;
}) {
  const { setPrompt, deleteTurn } = useTerminalChat();
  const { safety, detail, followUps, prompt } = data;

  function handleDelete() {
    if (messageId) deleteTurn(messageId);
    else onDelete?.();
  }

  return (
    <div
      className={cn(
        'my-3 rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 via-[var(--card)] to-[var(--card)] p-4 sm:p-5 space-y-4',
        className
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400">
          <ShieldAlert className="h-5 w-5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <h3 className="text-sm font-semibold text-[var(--foreground)]">{safety.title}</h3>
          {prompt ? (
            <p className="text-[11px] text-[var(--muted)] truncate">Request: {prompt}</p>
          ) : null}
          {detail ? <p className="text-xs text-amber-700 dark:text-amber-300">{detail}</p> : null}
        </div>
        {(messageId || onDelete) && (
          <button
            type="button"
            onClick={handleDelete}
            title="Delete this request and response"
            className="shrink-0 p-2 rounded-lg border border-red-500/30 text-red-500 hover:bg-red-500/10 transition-colors"
            aria-label="Delete blocked message"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>

      <blockquote className="rounded-xl border border-[var(--card-border)] bg-[var(--card)]/80 p-4 space-y-2">
        <p className="text-lg leading-relaxed text-right font-serif text-[var(--foreground)]" dir="rtl">
          {safety.quranArabic}
        </p>
        <p className="text-sm text-[var(--foreground)]/90 italic">&ldquo;{safety.quranTranslation}&rdquo;</p>
        <footer className="text-[11px] text-[var(--muted)]">— {safety.quranReference}</footer>
      </blockquote>

      <ul className="space-y-2 text-xs text-[var(--foreground)]/85 leading-relaxed">
        {safety.guidance.map((line) => (
          <li key={line} className="flex gap-2">
            <span className="text-amber-600 dark:text-amber-400 shrink-0">•</span>
            <span>{line}</span>
          </li>
        ))}
      </ul>

      <p className="text-xs text-[var(--muted)] leading-relaxed border-t border-[var(--card-border)] pt-3">
        {safety.leakFallback}
      </p>

      {(followUps?.length ?? safety.creativeAlternatives.length) > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] font-medium text-[var(--muted)] flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            Try something creative &amp; family-safe
          </p>
          <div className="flex flex-wrap gap-1.5">
            {(followUps ?? safety.creativeAlternatives).map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => setPrompt(suggestion)}
                className="rounded-full border border-[var(--card-border)] bg-[var(--card)] px-2.5 py-1 text-[11px] text-[var(--foreground)] hover:border-amber-500/40 hover:bg-amber-500/10 transition-colors"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
