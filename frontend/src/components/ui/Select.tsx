'use client';

import { useId, type SelectHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'> {
  label?: string;
  id?: string;
  wrapperClassName?: string;
}

/**
 * Native <select> styled to the token system, with a real <label> so it is
 * announced correctly by screen readers (the previous Settings selects had
 * no programmatic label).
 */
export function Select({ label, id, className, wrapperClassName, ...rest }: SelectProps) {
  const autoId = useId();
  const selectId = id ?? autoId;

  return (
    <div className={cn('flex flex-col gap-1.5', wrapperClassName)}>
      {label && (
        <label htmlFor={selectId} className="text-xs font-medium text-[var(--text-secondary)]">
          {label}
        </label>
      )}
      <div className="relative">
        <select
          id={selectId}
          className={cn(
            'w-full appearance-none rounded-token-sm border border-[var(--border-subtle)] bg-[var(--surface-inset)]',
            'px-3 py-2 pr-8 text-sm text-[var(--text-primary)]',
            'focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]',
            'disabled:cursor-not-allowed disabled:opacity-50',
            className,
          )}
          {...rest}
        />
        <ChevronDown
          aria-hidden="true"
          className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]"
        />
      </div>
    </div>
  );
}
