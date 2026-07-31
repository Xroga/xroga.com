'use client';

/**
 * Compact showcase card.
 *
 * Layout follows the supplied reference: a colour-blocked upper block carrying
 * pill chips, the product name and a one-line description, then a thumbnail band
 * below with the primary action overlaid on it. Thumbnails are CSS-composed rather
 * than bitmaps so the grid costs no image requests and stays crisp in every theme.
 */

import Link from 'next/link';
import { ArrowRight, Sparkles } from 'lucide-react';
import { GitHubIcon } from '@/components/icons/GitHubIcon';
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
  onCustomize?: (template: ShowcaseTemplate) => void;
  onGithub?: (template: ShowcaseTemplate) => void;
  className?: string;
  /** Denser variant used inside the workspace. */
  compact?: boolean;
}) {
  const previewRoute = previewRouteFor(template);
  const live = isLive(template);

  return (
    <article
      className={cn(
        'group flex flex-col overflow-hidden rounded-token-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] transition-shadow hover:shadow-elevated',
        className,
      )}
    >
      {/* Colour-blocked header */}
      <div
        className={cn('relative', compact ? 'p-3.5' : 'p-5')}
        style={{ background: `color-mix(in srgb, ${template.accent} 16%, var(--surface-raised))` }}
      >
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="rounded-full bg-[var(--surface-page)]/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
            {template.category}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-page)]/70 px-2 py-0.5 text-[10px] font-semibold text-[var(--text-secondary)]">
            <Sparkles className="h-2.5 w-2.5" aria-hidden="true" />
            Built with Xroga AI
          </span>
          {!live && (
            <span className="rounded-full bg-[var(--warning-dim)] px-2 py-0.5 text-[10px] font-semibold text-[var(--warning)]">
              In development
            </span>
          )}
        </div>

        <h3 className={cn('mt-2.5 font-semibold leading-tight text-[var(--text-primary)]', compact ? 'text-base' : 'text-lg')}>
          {template.name}
        </h3>
        <p className={cn('mt-1 text-[var(--text-secondary)]', compact ? 'text-[11px] leading-snug' : 'text-xs leading-relaxed')}>
          {template.shortDescription}
        </p>
      </div>

      {/* Thumbnail band with the primary action overlaid */}
      <div
        className={cn('relative border-t border-[var(--border-subtle)]', compact ? 'h-24' : 'h-36')}
        style={{
          background: `linear-gradient(135deg, color-mix(in srgb, ${template.accent} 26%, transparent), color-mix(in srgb, ${template.accent} 6%, transparent))`,
        }}
      >
        {/* Abstract wireframe suggestion of the product, theme-safe. */}
        <div aria-hidden className="pointer-events-none absolute inset-0 p-3">
          <div className="h-full w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-page)]/55 p-2">
            <div className="h-1.5 w-10 rounded-full bg-[var(--border-strong)]/50" />
            <div className="mt-1.5 h-1.5 w-16 rounded-full bg-[var(--border-strong)]/35" />
            <div className="mt-2 grid grid-cols-3 gap-1.5">
              <div className="h-5 rounded bg-[var(--border-strong)]/25" />
              <div className="h-5 rounded bg-[var(--border-strong)]/25" />
              <div className="h-5 rounded bg-[var(--border-strong)]/25" />
            </div>
          </div>
        </div>

        <div className="absolute bottom-2.5 left-2.5">
          {live && previewRoute ? (
            <Link
              href={previewRoute}
              className="inline-flex items-center gap-1.5 rounded-full bg-[var(--text-primary)] px-3 py-1.5 text-[11px] font-semibold text-[var(--surface-page)] transition-transform hover:translate-x-0.5 focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
            >
              Preview
              <ArrowRight className="h-3 w-3" aria-hidden="true" />
            </Link>
          ) : (
            <span
              className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-full bg-[var(--surface-page)]/80 px-3 py-1.5 text-[11px] font-semibold text-[var(--text-muted)]"
              aria-disabled="true"
            >
              Preview coming
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className={cn('mt-auto flex items-center gap-2 border-t border-[var(--border-subtle)]', compact ? 'p-2.5' : 'p-3')}>
        <Link
          href={`/showcase/${template.slug}`}
          className="text-[11px] font-semibold text-[var(--text-secondary)] underline-offset-2 hover:text-[var(--text-primary)] hover:underline focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
        >
          Details
        </Link>

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
          aria-label={`Use ${template.name} in GitHub`}
          title="Use in GitHub"
          className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--border-subtle)] text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
        >
          <GitHubIcon className="h-3.5 w-3.5" />
        </button>
      </div>
    </article>
  );
}
