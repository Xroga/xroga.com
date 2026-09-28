'use client';

import { useEffect, useMemo, useState } from 'react';
import { IntegrationLogo } from '@/components/integrations/IntegrationLogo';
import { composioLogoUrl } from '@/lib/pluginCatalog';
import { getIntegrationLogo } from '@/lib/integrationLogos';

const SIMPLE_ICON_ALIASES: Record<string, string> = {
  'google-calendar': 'googlecalendar',
  googlecalendar: 'googlecalendar',
  'google-drive': 'googledrive',
  googledrive: 'googledrive',
  quickbooks: 'quickbooks',
  'microsoft-outlook': 'microsoftoutlook',
  outlook: 'microsoftoutlook',
  outlookemail: 'microsoftoutlook',
  outlookcalendar: 'microsoftoutlook',
  monday: 'mondaydotcom',
  'monday-com': 'mondaydotcom',
  microsoftpowerbi: 'powerbi',
  powerbi: 'powerbi',
  aws: 'amazonwebservices',
  amazonaws: 'amazonwebservices',
  googlemeet: 'googlemeet',
};

function simpleIconSlug(value: string): string {
  const clean = value
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/\.com\b/g, 'dotcom')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return SIMPLE_ICON_ALIASES[clean] || SIMPLE_ICON_ALIASES[clean.replace(/-/g, '')] || clean.replace(/-/g, '');
}

function simpleIconCandidates(toolkit: string | undefined, name: string): string[] {
  const slugs = [
    toolkit ? simpleIconSlug(toolkit.replace(/^custom[_-]+/i, '')) : '',
    simpleIconSlug(name),
  ].filter(Boolean);

  return [...new Set(slugs)].map(
    (slug) => `https://cdn.jsdelivr.net/npm/simple-icons@v16/icons/${encodeURIComponent(slug)}.svg`,
  );
}

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
  const candidates = useMemo(() => {
    const customToolkit =
      toolkit?.toLowerCase().startsWith('custom_') ?? false;

    return [
      // Prefer Xroga's known first-party/local brand asset, then the official
      // toolkit logo CDN. Provider metadata can occasionally contain stale
      // logo URLs, so it comes after the canonical CDN. Custom MCP apps skip
      // upstream generic branding and fall back to an honest Xroga initial.
      getIntegrationLogo(id),
      toolkit && !customToolkit ? composioLogoUrl(toolkit) : undefined,
      !customToolkit ? logo : undefined,
      ...simpleIconCandidates(toolkit, name),
      fallbackLogo,
    ].filter(
      (value, candidateIndex, all): value is string =>
        typeof value === 'string' &&
        value.length > 0 &&
        all.indexOf(value) === candidateIndex,
    );
  }, [id, logo, fallbackLogo, toolkit, name]);

  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
  }, [id, logo, fallbackLogo, toolkit, name]);

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

  return (
    <span
      className={`${dimension} flex shrink-0 items-center justify-center border border-[var(--border-subtle)] bg-[var(--surface-inset)]`}
    >
      <IntegrationLogo id={id} name={name} size={iconSize} />
    </span>
  );
}