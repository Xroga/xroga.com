'use client';

import { useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { getIntegrationLogo } from '@/lib/integrationLogos';
import { GithubGlyphIcon } from '@/components/icons/animated/GithubGlyphIcon';
import { VercelIcon } from '@/components/icons/animated/VercelIcon';

function initialsFor(name: string): string {
  const clean = name.trim();
  if (!clean) return 'PL';

  const parts = clean
    .split(/\s+/g)
    .filter(Boolean)
    .slice(0, 2);

  return parts
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
    .slice(0, 2) || 'PL';
}

/**
 * Brand mark used across Plugin surfaces.
 *
 * Native Xroga providers keep their animated glyphs. Other providers prefer
 * explicit/provider metadata logos, then Xroga's known logo map. A deterministic
 * initials fallback prevents broken-image placeholders from leaking into the UI.
 */
export function IntegrationLogo({
  id,
  name,
  size = 18,
  className,
  src,
}: {
  id: string;
  name?: string;
  size?: number;
  className?: string;
  src?: string;
}) {
  const [failed, setFailed] = useState(false);

  const label = name ?? id;
  const imageSrc = useMemo(
    () => src || getIntegrationLogo(id, name),
    [id, name, src],
  );

  useEffect(() => {
    setFailed(false);
  }, [imageSrc]);

  if (id === 'github' && !src) {
    return (
      <span
        className={cn('inline-flex items-center justify-center', className)}
        aria-hidden="true"
      >
        <GithubGlyphIcon size={size} />
      </span>
    );
  }

  if (id === 'vercel' && !src) {
    return (
      <span
        className={cn('inline-flex items-center justify-center', className)}
        aria-hidden="true"
      >
        <VercelIcon size={size} />
      </span>
    );
  }

  if (imageSrc && !failed) {
    return (
      <img
        src={imageSrc}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        className={cn('object-contain', className)}
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <span
      className={cn(
        'inline-flex items-center justify-center rounded-md bg-[var(--surface-inset)] font-bold tracking-tight text-[var(--text-primary)]',
        className,
      )}
      style={{
        width: size,
        height: size,
        fontSize: Math.max(8, Math.round(size * 0.36)),
      }}
      aria-label={`${label} logo`}
      role="img"
    >
      {initialsFor(label)}
    </span>
  );
}
