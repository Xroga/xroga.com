'use client';

import { useEffect, useState } from 'react';
import { Check, Copy } from 'lucide-react';

export function InlineCopyButton({ value, label = 'Copy' }: { value: string; label?: string }) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle');

  useEffect(() => {
    if (status === 'idle') return;
    const timer = window.setTimeout(() => setStatus('idle'), 1400);
    return () => window.clearTimeout(timer);
  }, [status]);

  const copied = status === 'copied';
  const buttonLabel = copied ? 'Copied' : status === 'failed' ? 'Copy failed' : label;

  return (
    <button
      type="button"
      className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-xs text-[var(--muted)] transition-colors duration-100 hover:bg-[var(--foreground)]/[0.06] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
      aria-label={buttonLabel}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setStatus('copied');
        } catch {
          setStatus('failed');
        }
      }}
    >
      {copied ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
      <span aria-live="polite">{buttonLabel}</span>
    </button>
  );
}
