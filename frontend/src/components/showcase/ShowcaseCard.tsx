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
import { Play } from 'lucide-react';
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
  onSelect,
  className,
  compact = false,
  priority = false,
}: {
  template: ShowcaseTemplate;
  /**
   * When set, the whole card selects the template instead of navigating — used in
   * the workspace, where picking a template is the point. Otherwise the card links
   * to its detail page, where the product can be seen and previewed.
   */
  onSelect?: (template: ShowcaseTemplate) => void;
  className?: string;
  /** Denser variant used inside the workspace. */
  compact?: boolean;
  /** Set on the first card above the fold so its image is not lazy. */
  priority?: boolean;
}) {
  const previewRoute = previewRouteFor(template);
  const live = isLive(template);
  const size = THUMBNAIL_SIZES.desktop;

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
          alt={template.name}
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
              // z-10 is required, not cosmetic: the card-wide link paints an
              // ::after overlay across the whole card, which would otherwise
              // swallow this click and make Preview unreachable.
              'absolute bottom-3 left-3 z-10 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5',
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
          {onSelect ? (
            <button
              type="button"
              onClick={() => onSelect(template)}
              className="text-left after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
            >
              {template.name}
            </button>
          ) : (
            <Link
              href={`/showcase/${template.slug}`}
              className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
            >
              {template.name}
            </Link>
          )}
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

    </article>
  );
}
