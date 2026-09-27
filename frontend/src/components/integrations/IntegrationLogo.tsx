'use client';

import Image from 'next/image';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { getIntegrationLogo } from '@/lib/integrationLogos';
import { GithubGlyphIcon } from '@/components/icons/animated/GithubGlyphIcon';
import { VercelIcon } from '@/components/icons/animated/VercelIcon';
import { Plug } from 'lucide-react';

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
          'inline-flex items-center justify-center rounded-md bg-[var(--surface-inset)] text-[var(--text-muted)]',
          className,
        )}
        style={{ width: size, height: size }}
        aria-label={label}
      >
        <Plug size={Math.max(12, Math.round(size * 0.72))} aria-hidden="true" />
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