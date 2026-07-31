'use client';

/**
 * Showcase card.
 *
 * The visual is a real screenshot of the running product, captured by
 * `scripts/capture-showcase-thumbnails.mjs`. It is deliberately not a live frame:
 * a page can show all six cards without booting six application runtimes, which
 * matters most on the homepage. The interactive product runs on the detail and
 * preview routes, where the user has actually asked to try it.
 *
 * Nothing here is a mockup — if a product's design changes, the capture script is
 * re-run, so a card cannot advertise something the product does not render.
 */

import Image from 'next/image';
import Link from 'next/link';
import { ArrowUpRight, Play } from 'lucide-react';
import { GitHubIcon } from '@/components/icons/GitHubIcon';
import { cn } from '@/lib/utils';
import {
  THUMBNAIL_SIZES,
  isLive,
  previewRouteFor,
  thumbnailFor,
  type ShowcaseTemplate,
} from '@/lib/showcase/registry';

export function ShowcaseCard({
  template,
  onCustomize,
  onGithub,
  className,
  compact = false,
  priority = false,
}: {
  template: ShowcaseTemplate;
  /** Omit to render a browse-only card (no customize/export actions). */
  onCustomize?: (template: ShowcaseTemplate) => void;
  onGithub?: (template: ShowcaseTemplate) => void;
  className?: string;
  /** Denser variant used inside the workspace. */
  compact?: boolean;
  /** Set on the first card above the fold so its image is not lazy. */
  priority?: boolean;
}) {
  const previewRoute = previewRouteFor(template);
  const live = isLive(template);
  const size = THUMBNAIL_SIZES.desktop;
  const capabilities = template.capabilities.slice(0, compact ? 2 : 3);
  const technologies = template.technologies.slice(0, 3);

  return (
    <article
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-token-lg border border-[var(--border-subtle)]',
        'bg-[var(--surface-raised)] transition-all duration-300',
        'hover:-translate-y-0.5 hover:border-[var(--border-strong)] hover:shadow-elevated',
        'focus-within:border-[var(--border-strong)] focus-within:shadow-elevated',
        'motion-reduce:transition-none motion-reduce:hover:translate-y-0',
        className,
      )}
    >
      {/* Real screenshot of the product */}
      <div className="relative border-b border-[var(--border-subtle)] bg-[var(--surface-inset)]">
        <Image
          src={thumbnailFor(template)}
          alt={`${template.name} — screenshot of the running product`}
          width={size.width}
          height={size.height}
          sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
          priority={priority}
          loading={priority ? undefined : 'lazy'}
          className="block h-auto w-full"
        />

        <span
          className="absolute left-3 top-3 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white backdrop-blur"
          style={{ background: `color-mix(in srgb, ${template.accent} 88%, transparent)` }}
        >
          {template.category}
        </span>

        {live && (
          <span className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-[var(--surface-page)]/90 px-2 py-0.5 text-[10px] font-semibold text-[var(--text-primary)] backdrop-blur">
            {/* Paired with a label, so the state never depends on colour alone. */}
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[var(--success,#16a34a)]" />
            Live
          </span>
        )}

        {/* Preview affordance over the image */}
        {previewRoute && (
          <Link
            href={previewRoute}
            className={cn(
              'absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5',
              'bg-[var(--text-primary)] text-[11px] font-semibold text-[var(--surface-page)]',
              'opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100',
              'motion-reduce:transition-none focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]',
            )}
          >
            <Play className="h-3 w-3" aria-hidden="true" />
            Preview
          </Link>
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

        {/* Key capabilities */}
        <ul className="mt-2.5 space-y-1">
          {capabilities.map((capability) => (
            <li key={capability} className="flex items-start gap-1.5 text-[11px] leading-snug text-[var(--text-secondary)]">
              <span aria-hidden className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[var(--accent)]" />
              {capability}
            </li>
          ))}
        </ul>

        {/* Technology labels */}
        <div className="mt-2.5 flex flex-wrap gap-1">
          {technologies.map((tech) => (
            <span
              key={tech}
              className="rounded bg-[var(--surface-inset)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-muted)]"
            >
              {tech}
            </span>
          ))}
        </div>
      </div>

      {/* Actions sit above the card-wide link so they stay clickable. */}
      <div
        className={cn(
          'relative z-10 mt-auto flex items-center gap-2 border-t border-[var(--border-subtle)]',
          compact ? 'p-2.5' : 'px-4 py-3',
        )}
      >
        {previewRoute ? (
          <Link
            href={previewRoute}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--text-secondary)] underline-offset-2 transition-colors hover:text-[var(--text-primary)] hover:underline focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
          >
            Preview
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

        {onCustomize ? (
          <button
            type="button"
            onClick={() => onCustomize(template)}
            className="ml-auto rounded-full bg-[var(--accent)] px-3 py-1.5 text-[11px] font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
          >
            Customize for me
          </button>
        ) : (
          <Link
            href={`/showcase/${template.slug}`}
            className="ml-auto inline-flex items-center gap-1 rounded-full border border-[var(--border-subtle)] px-3 py-1.5 text-[11px] font-semibold text-[var(--text-primary)] transition-colors hover:border-[var(--border-strong)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
          >
            Details
            <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
          </Link>
        )}

        {onGithub && (
          <button
            type="button"
            onClick={() => onGithub(template)}
            aria-label={`Copy ${template.name} into a GitHub repository`}
            title="Use in GitHub"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--border-subtle)] text-[var(--text-secondary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
          >
            <GitHubIcon className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </article>
  );
}
