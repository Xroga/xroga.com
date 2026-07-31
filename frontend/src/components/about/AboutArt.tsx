'use client';

/**
 * Illustration frame for the About page.
 *
 * The four voxel renders are not in the repository yet. Rather than break the build or
 * substitute unrelated stock imagery, this renders a composed placeholder frame —
 * grid lines and stacked blocks drawn in markup — and swaps to the real image the
 * moment the file exists at its path. `onError` handles the missing-file case, so
 * dropping the PNGs into /public/about is the only step needed later.
 *
 * The frame reserves its aspect ratio in both states, so adding the art causes no
 * layout shift.
 */

import Image from 'next/image';
import { useState } from 'react';
import { cn } from '@/lib/utils';

export function AboutArt({
  src,
  alt,
  className,
  priority = false,
}: {
  src: string;
  alt: string;
  className?: string;
  priority?: boolean;
}) {
  const [failed, setFailed] = useState(false);

  return (
    <div className={cn('ab-art', className)}>
      <div className="ab-art-grid" aria-hidden />

      {failed ? (
        // Decorative stand-in. Hidden from assistive tech because it conveys nothing
        // the surrounding copy does not already say.
        <div className="ab-art-fallback" aria-hidden>
          <span className="ab-art-block ab-art-block--a" />
          <span className="ab-art-block ab-art-block--b" />
          <span className="ab-art-block ab-art-block--c" />
          <span className="ab-art-screen" />
        </div>
      ) : (
        <Image
          src={src}
          alt={alt}
          width={720}
          height={560}
          priority={priority}
          onError={() => setFailed(true)}
          className="ab-art-img"
        />
      )}
    </div>
  );
}
