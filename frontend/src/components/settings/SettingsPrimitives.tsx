import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Eyebrow icon + title + one-line description, optionally with a contextual action on the right. */
export function SettingsPanelHeader({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h2 className="flex items-center gap-2 text-base font-semibold text-[var(--text-primary)]">
          {icon}
          {title}
        </h2>
        {description && <p className="mt-1 text-sm text-[var(--text-secondary)]">{description}</p>}
      </div>
      {action}
    </div>
  );
}

/** A plain divided row for an ordinary preference — not a card. Use SettingsCard only for meaningfully grouped objects. */
export function SettingsRow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('border-b border-[var(--border-subtle)] py-1 last:border-b-0', className)}>{children}</div>;
}

/** A visually distinct grouped object: plan summary, companion preview, integration connection, danger zone. */
export function SettingsCard({
  children,
  className,
  tone = 'default',
}: {
  children: ReactNode;
  className?: string;
  tone?: 'default' | 'danger';
}) {
  return (
    <div
      className={cn(
        'rounded-token-lg border p-4 sm:p-5',
        tone === 'danger'
          ? 'border-[var(--danger-dim)] bg-[var(--danger-dim)]'
          : 'border-[var(--border-subtle)] bg-[var(--surface-raised)]',
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Vertical rhythm wrapper for a settings panel's sections. */
export function SettingsStack({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('space-y-6', className)}>{children}</div>;
}

/** Section divider with an optional small label — used instead of wrapping every group in its own card. */
export function SettingsDivider({ label }: { label?: string }) {
  if (!label) return <hr className="border-t border-[var(--border-subtle)]" />;
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">{label}</span>
      <span className="h-px flex-1 bg-[var(--border-subtle)]" />
    </div>
  );
}
