import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';

const toneClasses: Record<Tone, string> = {
  neutral: 'bg-[var(--surface-inset)] text-[var(--text-secondary)] border-[var(--border-subtle)]',
  accent: 'bg-[var(--accent-dim)] text-[var(--accent)] border-transparent',
  success: 'bg-[var(--success-dim)] text-[var(--success)] border-transparent',
  warning: 'bg-[var(--warning-dim)] text-[var(--warning)] border-transparent',
  danger: 'bg-[var(--danger-dim)] text-[var(--danger)] border-transparent',
};

export function Badge({
  tone = 'neutral',
  children,
  className,
  dot,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
  /** Small status dot, useful for connection-state badges. */
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium leading-none',
        toneClasses[tone],
        className,
      )}
    >
      {dot && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden="true" />}
      {children}
    </span>
  );
}
