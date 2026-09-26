'use client';

import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { getIntegrationLogo } from '@/lib/integrationLogos';
import { IntegrationLogo } from '@/components/integrations/IntegrationLogo';

function initialsFor(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/g)
    .filter(Boolean)
    .slice(0, 2);

  const initials = parts.map((part) => part[0]?.toUpperCase() ?? '').join('');
  return initials || 'APP';
}

export function PluginLogo({
  id,
  name,
  src,
  size = 40,
  compact = false,
  className,
}: {
  id: string;
  name: string;
  src?: string;
  size?: number;
  compact?: boolean;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const resolved = useMemo(
    () => src || getIntegrationLogo(id, name),
    [id, name, src],
  );

  const markSize = compact ? Math.min(size, 20) : Math.min(size, 24);

  if ((id === 'github' || id === 'vercel') && !src && !failed) {
    return (
      <span
        className={cn(
          'inline-flex shrink-0 items-center justify-center rounded-[12px] border border-[var(--border-subtle)] bg-white text-black',
          compact ? 'h-9 w-9' : 'h-10 w-10',
          className,
        )}
        aria-hidden="true"
      >
        <IntegrationLogo id={id} name={name} size={markSize} />
      </span>
    );
  }

  if (resolved && !failed) {
    return (
      <span
        className={cn(
          'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[12px] border border-[var(--border-subtle)] bg-white',
          compact ? 'h-9 w-9' : 'h-10 w-10',
          className,
        )}
      >
        {/* Dynamic provider URLs come from Xroga/Composio metadata and cannot be
            enumerated in Next image remotePatterns. Keep the image contained and
            fall back to stable initials if the provider asset fails. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={resolved}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          className="h-[72%] w-[72%] object-contain"
          onError={() => setFailed(true)}
        />
      </span>
    );
  }

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-[12px] border border-[var(--border-subtle)] bg-[var(--accent-dim)] text-[10px] font-bold tracking-wide text-[var(--accent)]',
        compact ? 'h-9 w-9' : 'h-10 w-10',
        className,
      )}
      aria-hidden="true"
    >
      {initialsFor(name)}
    </span>
  );
}
