'use client';

/**
 * Showcase card.
 *
 * The visual weight is the product itself: a live, scaled preview of the real
 * route fills the top of the card. Nothing here is a placeholder or a mockup, so
 * a card cannot advertise something the product does not actually render.
 *
 * Products still in development say so plainly instead of showing an empty frame.
 */

import Link from 'next/link';
import { ArrowUpRight, Hammer } from 'lucide-react';
import { GitHubIcon } from '@/components/icons/GitHubIcon';
import { LivePreviewFrame } from './LivePreviewFrame';
import { cn } from '@/lib/utils';
import { isLive, previewRouteFor, type ShowcaseTemplate } from '@/lib/showcase/registry';

export function ShowcaseCard({
  template,
  onCustomize,
  onGithub,
  className,
  compact = false,
}: {
  template: ShowcaseTemplate;
  /**
   * Omit both handlers for a link-only card. The homepage does that deliberately:
   * customizing needs an account, and a marketing section should not open an auth
   * wall from a button that looks like it does something in place.
   */
  onCustomize?: (template: ShowcaseTemplate) => void;
  onGithub?: (template: ShowcaseTemplate) => void;
  className?: string;
  /** Denser variant used inside the workspace. */
  compact?: boolean;
}) {
  const previewRoute = previewRouteFor(template);
  const live = isLive(template);
  const hasActions = Boolean(onCustomize || onGithub);

  return (
    <article
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-token-lg border border-[var(--border-subtle)]',
        'bg-[var(--surface-raised)] transition-all duration-300',
        'hover:-translate-y-0.5 hover:border-[var(--border-strong)] hover:shadow-elevated',
        'motion-reduce:transition-none motion-reduce:hover:translate-y-0',
        className,
      )}
    >
      {/* The product, live */}
      <div className="relative border-b border-[var(--border-subtle)] bg-[var(--surface-inset)]">
        {live && previewRoute ? (
          <>
            <LivePreviewFrame
              src={previewRoute}
              title={`${template.name} preview`}
              designHeight={compact ? 1000 : 900}
            />
            {/* Keeps the scaled type legible against the card edge. */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[var(--surface-raised)] to-transparent"
            />
          </>
        ) : (
          <div
            className="flex flex-col items-center justify-center gap-2 px-4 text-center"
            style={{ aspectRatio: '1440 / 900' }}
          >
            <span
              className="flex h-9 w-9 items-center justify-center rounded-full"
              style={{ background: `color-mix(in srgb, ${template.accent} 22%, transparent)` }}
            >
              <Hammer className="h-4 w-4" style={{ color: template.accent }} aria-hidden="true" />
            </span>
            <span className="text-xs font-semibold text-[var(--text-secondary)]">Being built now</span>
            <span className="max-w-[22ch] text-[11px] leading-snug text-[var(--text-muted)]">
              No preview yet — we do not show mockups of things that are not running.
            </span>
          </div>
        )}

        <span
          className="absolute left-3 top-3 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider backdrop-blur"
          style={{
            background: `color-mix(in srgb, ${template.accent} 88%, transparent)`,
            color: '#fff',
          }}
        >
          {template.category}
        </span>

        {live && (
          <span className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-[var(--surface-page)]/85 px-2 py-0.5 text-[10px] font-semibold text-[var(--text-primary)] backdrop-blur">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[var(--success,#16a34a)]" />
            Live
          </span>
        )}
      </div>

      {/* Identity */}
      <div className={cn('flex-1', compact ? 'p-3.5' : 'p-4')}>
        <h3
          className={cn(
            'font-semibold leading-tight tracking-tight text-[var(--text-primary)]',
            compact ? 'text-[15px]' : 'text-lg',
          )}
        >
          <Link
            href={`/showcase/${template.slug}`}
            className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
          >
            {template.name}
          </Link>
        </h3>
        <p
          className={cn(
            'mt-1.5 text-[var(--text-secondary)]',
            compact ? 'text-[11px] leading-snug' : 'text-xs leading-relaxed',
          )}
        >
          {template.shortDescription}
        </p>
      </div>

      {/* Actions sit above the card-wide link so they stay clickable. */}
      <div
        className={cn(
          'relative z-10 mt-auto flex items-center gap-2 border-t border-[var(--border-subtle)]',
          compact ? 'p-2.5' : 'px-4 py-3',
        )}
      >
        {live && previewRoute ? (
          <Link
            href={previewRoute}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--text-secondary)] underline-offset-2 transition-colors hover:text-[var(--text-primary)] hover:underline focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
          >
            Open it
            <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
          </Link>
        ) : (
          <Link
            href={`/showcase/${template.slug}`}
            className="text-[11px] font-semibold text-[var(--text-secondary)] underline-offset-2 transition-colors hover:text-[var(--text-primary)] hover:underline focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
          >
            What it ships with
          </Link>
        )}

        {hasActions ? (
          <>
            <button
              type="button"
              onClick={() => onCustomize?.(template)}
              className="ml-auto rounded-full bg-[var(--accent)] px-3 py-1.5 text-[11px] font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
            >
              Customize for me
            </button>

            <button
              type="button"
              onClick={() => onGithub?.(template)}
              aria-label={`Copy ${template.name} into a GitHub repository`}
              title="Use in GitHub"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--border-subtle)] text-[var(--text-secondary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
            >
              <GitHubIcon className="h-3.5 w-3.5" />
            </button>
          </>
        ) : (
          <Link
            href={`/showcase/${template.slug}`}
            className="ml-auto inline-flex items-center gap-1 rounded-full border border-[var(--border-subtle)] px-3 py-1.5 text-[11px] font-semibold text-[var(--text-primary)] transition-colors hover:border-[var(--border-strong)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
          >
            Details
            <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
          </Link>
        )}
      </div>
    </article>
  );
}
