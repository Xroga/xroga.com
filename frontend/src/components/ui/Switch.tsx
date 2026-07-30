'use client';

import { useId } from 'react';
import { cn } from '@/lib/utils';

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
  id?: string;
}

/**
 * Accessible on/off control shared by every settings row. Renders as a real
 * checkbox for screen readers (role="switch" + aria-checked) with a styled
 * track driven entirely by design tokens, so it follows the active accent.
 */
export function Switch({ checked, onChange, label, description, disabled, id }: SwitchProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const descId = description ? `${inputId}-desc` : undefined;

  return (
    <label
      htmlFor={inputId}
      className={cn(
        'flex items-center justify-between gap-4 py-3',
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
      )}
    >
      <span className="min-w-0">
        <span className="block text-sm font-medium text-[var(--text-primary)]">{label}</span>
        {description && (
          <span id={descId} className="mt-0.5 block text-xs leading-relaxed text-[var(--text-muted)]">
            {description}
          </span>
        )}
      </span>
      <span className="relative inline-flex shrink-0 items-center">
        <input
          id={inputId}
          type="checkbox"
          role="switch"
          aria-checked={checked}
          aria-describedby={descId}
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
          className="peer absolute inset-0 h-6 w-11 cursor-pointer opacity-0 disabled:cursor-not-allowed"
        />
        <span
          aria-hidden="true"
          className={cn(
            'h-6 w-11 rounded-full border transition-colors duration-150',
            'peer-focus-visible:shadow-[var(--focus-ring)]',
            checked
              ? 'border-transparent bg-[var(--accent)]'
              : 'border-[var(--border-subtle)] bg-[var(--surface-inset)]',
          )}
        />
        <span
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute top-0.5 h-5 w-5 rounded-full bg-[var(--surface-page)] shadow-subtle transition-transform duration-150',
            checked ? 'translate-x-[22px]' : 'translate-x-0.5',
          )}
        />
      </span>
    </label>
  );
}
