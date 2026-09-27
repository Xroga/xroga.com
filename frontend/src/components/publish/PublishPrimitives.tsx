'use client';

import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import {
  Check,
  Circle,
  ExternalLink,
  Globe,
  Loader2,
  Monitor,
  Puzzle,
  Smartphone,
  TriangleAlert,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import type {
  ChecklistItem,
  PublishTarget,
} from '@/lib/publish/types';

export function PublishStatusBadge({
  label,
  tone = 'neutral',
}: {
  label: string;
  tone?: 'success' | 'warning' | 'danger' | 'neutral' | 'active';
}) {
  const toneClass =
    tone === 'success'
      ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-600'
      : tone === 'warning'
        ? 'border-amber-500/35 bg-amber-500/10 text-amber-600'
        : tone === 'danger'
          ? 'border-red-500/35 bg-red-500/10 text-red-500'
          : tone === 'active'
            ? 'border-[var(--accent)]/40 bg-[var(--accent-dim)] text-[var(--accent)]'
            : 'border-[var(--border-subtle)] bg-[var(--surface-inset)] text-[var(--text-secondary)]';

  return (
    <span
      className={cn(
        'inline-flex min-h-7 items-center rounded-full border px-2.5 text-[11px] font-semibold',
        toneClass,
      )}
    >
      {label}
    </span>
  );
}

export function PublishRequirement({
  item,
  pluginId,
  actionLabel,
}: {
  item: ChecklistItem;
  pluginId?: string;
  actionLabel?: string;
}) {
  const href =
    !item.done && pluginId
      ? `/dashboard/integrations/${encodeURIComponent(pluginId)}`
      : item.href;
  const external = href?.startsWith('http');

  return (
    <div className="flex flex-col gap-3 border-b border-[var(--border-subtle)] py-3 last:border-b-0 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        {item.done ? (
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600">
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
        ) : (
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-[var(--border-subtle)] text-[var(--text-muted)]">
            <Circle className="h-3 w-3" aria-hidden="true" />
          </span>
        )}

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-[var(--text-primary)]">{item.label}</p>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              {item.required ? 'Required' : 'Optional'}
            </span>
          </div>
          {item.hint ? (
            <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">{item.hint}</p>
          ) : null}
        </div>
      </div>

      {!item.done && href ? (
        external ? (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 rounded-token-sm border border-[var(--border-subtle)] px-3 text-xs font-semibold text-[var(--text-primary)] transition hover:border-[var(--accent)]/50"
          >
            {actionLabel || 'Open'}
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        ) : (
          <Link
            href={href}
            className="inline-flex min-h-9 shrink-0 items-center justify-center rounded-token-sm border border-[var(--border-subtle)] px-3 text-xs font-semibold text-[var(--text-primary)] transition hover:border-[var(--accent)]/50"
          >
            {actionLabel || 'Set up'}
          </Link>
        )
      ) : null}
    </div>
  );
}

export function PublishError({
  title,
  body,
  onRetry,
}: {
  title: string;
  body?: string;
  onRetry?: () => void;
}) {
  return (
    <div
      className="rounded-token-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4"
      role="status"
    >
      <div className="flex items-start gap-3">
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[var(--text-primary)]">{title}</p>
          {body ? <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">{body}</p> : null}
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="mt-3 inline-flex min-h-9 items-center rounded-token-sm border border-[var(--border-subtle)] px-3 text-xs font-semibold text-[var(--text-primary)]"
            >
              Retry
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function PublishLoading({ label = 'Checking publish readiness…' }: { label?: string }) {
  return (
    <div className="flex min-h-28 items-center justify-center gap-2 rounded-token-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] text-sm text-[var(--text-secondary)]">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export function PublishDisclosure({
  title,
  description,
  children,
  open,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  open?: boolean;
}) {
  return (
    <details
      open={open}
      className="rounded-token-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)]"
    >
      <summary className="cursor-pointer list-none px-4 py-3.5 focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]">
        <p className="text-sm font-semibold text-[var(--text-primary)]">{title}</p>
        {description ? (
          <p className="mt-0.5 text-xs leading-5 text-[var(--text-secondary)]">{description}</p>
        ) : null}
      </summary>
      <div className="border-t border-[var(--border-subtle)] p-4">{children}</div>
    </details>
  );
}

export function PublishTargetTabs({
  target,
  onChange,
  statuses,
}: {
  target: PublishTarget;
  onChange: (target: PublishTarget) => void;
  statuses: Record<PublishTarget, { label: string; tone: 'success' | 'warning' | 'neutral' }>;
}) {
  const items: Array<{ id: PublishTarget; label: string; icon: LucideIcon }> = [
    { id: 'web', label: 'Web', icon: Globe },
    { id: 'chrome', label: 'Chrome', icon: Puzzle },
    { id: 'desktop', label: 'Desktop', icon: Monitor },
    { id: 'mobile', label: 'Mobile', icon: Smartphone },
  ];

  return (
    <div
      className="flex gap-1 overflow-x-auto border-b border-[var(--border-subtle)] pb-px scrollbar-hide"
      role="tablist"
      aria-label="Publish target"
    >
      {items.map(({ id, label, icon: Icon }) => {
        const active = target === id;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(id)}
            className={cn(
              'flex min-h-12 shrink-0 items-center gap-2 border-b-2 px-3 text-sm transition focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]',
              active
                ? 'border-[var(--accent)] font-semibold text-[var(--text-primary)]'
                : 'border-transparent font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
            )}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            <span>{label}</span>
            <PublishStatusBadge
              label={statuses[id].label}
              tone={statuses[id].tone}
            />
          </button>
        );
      })}
    </div>
  );
}