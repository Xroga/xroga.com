'use client';

import { useEffect, useMemo, useState } from 'react';
import { IntegrationLogo } from '@/components/integrations/IntegrationLogo';
import { toolkitLogoAssetUrl } from '@/lib/pluginCatalog';

export function PluginBrandLogo({
  id,
  name,
  toolkit,
  logo,
  fallbackLogo,
  size = 'card',
}: {
  id: string;
  name: string;
  toolkit?: string;
  logo?: string;
  fallbackLogo?: string;
  size?: 'micro' | 'card' | 'detail';
}) {
  const candidates = useMemo(
    () =>
      [
        logo,
        fallbackLogo,
        toolkit ? toolkitLogoAssetUrl(toolkit) : undefined,
      ].filter(
        (value, index, all): value is string =>
          typeof value === 'string' &&
          value.length > 0 &&
          all.indexOf(value) === index,
      ),
    [logo, fallbackLogo, toolkit],
  );
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
  }, [id, logo, fallbackLogo, toolkit]);

  const dimension =
    size === 'detail'
      ? 'h-14 w-14 rounded-2xl p-2'
      : size === 'micro'
        ? 'h-6 w-6 rounded-lg p-0.5'
        : 'h-10 w-10 rounded-xl p-1.5';
  const iconSize = size === 'detail' ? 31 : size === 'micro' ? 15 : 22;

  if (index < candidates.length) {
    return (
      <img
        src={candidates[index]}
        alt={name}
        loading="lazy"
        className={`${dimension} shrink-0 border border-[var(--border-subtle)] bg-white object-contain`}
        onError={() => setIndex((current) => current + 1)}
      />
    );
  }

  if (id === 'github' || id === 'vercel' || id === 'supabase') {
    return (
      <span
        className={`${dimension} flex shrink-0 items-center justify-center border border-[var(--border-subtle)] bg-[var(--surface-inset)]`}
      >
        <IntegrationLogo id={id} name={name} size={iconSize} />
      </span>
    );
  }

  const initials = name
    .split(/\s+/g)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('') || 'APP';

  return (
    <span
      className={`${dimension} flex shrink-0 items-center justify-center border border-[var(--border-subtle)] bg-[var(--accent-dim)] text-[var(--accent)] font-bold tracking-tight`}
      aria-label={name}
      title={`${name} logo unavailable`}
    >
      <span style={{ fontSize: Math.max(9, Math.round(iconSize * 0.48)) }}>{initials}</span>
    </span>
  );
}