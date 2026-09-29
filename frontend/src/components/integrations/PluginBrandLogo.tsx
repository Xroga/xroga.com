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
  github: 'github',
  openai: 'openai',
  gemini: 'googlegemini',
  googlegemini: 'googlegemini',
  canva: 'canva',
  whop: 'whop',
  flyio: 'flydotio',
  'fly-io': 'flydotio',
  flydotio: 'flydotio',
  supabase: 'supabase',
  vercel: 'vercel',
  shopify: 'shopify',
  stripe: 'stripe',
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
    (slug) => `https://cdn.simpleicons.org/${encodeURIComponent(slug)}`,
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
      // Known Xroga brand mappings win for major providers, then use the live app
      // metadata returned by the provider catalog. Simple Icons is a broad
      // open-source fallback for recognizable brands. Custom MCP apps never
      // borrow an unrelated mark and fall back to honest initials.
      getIntegrationLogo(id),
      !customToolkit ? logo : undefined,
      ...(!customToolkit ? simpleIconCandidates(toolkit, name) : []),
      toolkit && !customToolkit ? composioLogoUrl(toolkit) : undefined,
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