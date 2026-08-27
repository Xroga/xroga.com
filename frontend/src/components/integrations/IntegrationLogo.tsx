'use client';

import Image from 'next/image';
import { cn } from '@/lib/utils';
import { getIntegrationLogo } from '@/lib/integrationLogos';
import { GithubGlyphIcon } from '@/components/icons/animated/GithubGlyphIcon';
import { VercelIcon } from '@/components/icons/animated/VercelIcon';

/**
 * One integration's mark, animated where we own the drawing.
 *
 * Every provider here is a brand SVG served as an image, and an image cannot move.
 * GitHub and Vercel are the two we have real components for, and they are also the two
 * that carry the most weight in this product — the repository connection and the
 * deployment target — so they draw themselves and run continuously. Everything else
 * falls through to its logo file unchanged.
 *
 * This exists as one component rather than a condition at each call site because there
 * are six of those, and the last time a mark was wired at only some of them the ones
 * that were missed stayed static without anything failing.
 *
 * `currentColor` is what makes both animated marks theme-aware: they take the ink of
 * whatever row they sit in rather than shipping a fixed black or white, which is the
 * whole reason the static `github.svg` looked wrong on half the themes.
 */
export function IntegrationLogo({
  id,
  name,
  size = 18,
  className,
}: {
  id: string;
  name?: string;
  size?: number;
  className?: string;
}) {
  if (id === 'github') {
    return (
      <span className={cn('inline-flex items-center justify-center', className)} aria-hidden="true">
        <GithubGlyphIcon size={size} />
      </span>
    );
  }

  if (id === 'vercel') {
    return (
      <span className={cn('inline-flex items-center justify-center', className)} aria-hidden="true">
        <VercelIcon size={size} />
      </span>
    );
  }

  const src = getIntegrationLogo(id, name);
  if (!src) return null;

  return (
    <Image
      src={src}
      alt={name ?? id}
      width={size}
      height={size}
      className={className}
      unoptimized
    />
  );
}
