'use client';

import Image from 'next/image';
import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { getIntegrationLogo } from '@/lib/integrationLogos';
import { GithubGlyphIcon } from '@/components/icons/animated/GithubGlyphIcon';
import { VercelIcon } from '@/components/icons/animated/VercelIcon';

function initialsFor(name: string): string {
  return name
    .split(/\s+/g)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

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
  const [failed, setFailed] = useState(false);
  const label = name ?? id;
  const initials = useMemo(() => initialsFor(label) || 'APP', [label]);

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

  const src = failed ? undefined : getIntegrationLogo(id);

  if (!src) {
    return (
      <span
        className={cn(
          'inline-flex items-center justify-center rounded-md bg-[var(--surface-inset)] font-semibold tracking-tight text-[var(--text-secondary)]',
          className,
        )}
        style={{ width: size, height: size, fontSize: Math.max(8, Math.round(size * 0.38)) }}
        aria-label={label}
      >
        {initials}
      </span>
    );
  }

  return (
    <Image
      src={src}
      alt={label}
      width={size}
      height={size}
      className={cn('object-contain', className)}
      onError={() => setFailed(true)}
      unoptimized
    />
  );
}
