'use client';

import { useEffect, useMemo, useState } from 'react';
import { IntegrationLogo } from '@/components/integrations/IntegrationLogo';
import { Blocks } from 'lucide-react';
import { composioLogoUrl } from '@/lib/pluginCatalog';
import { getIntegrationLogo } from '@/lib/integrationLogos';

/** Locally bundled SVGs that use white foreground shapes. Public
 * marketing cards must render these on a dark tile or the marks disappear.
 * Keep the signed-in dashboard's logo presentation unchanged.
 */
const WHITE_FOREGROUND_LOCAL_SVGS = new Set(['github', 'vercel', 'openai', 'cursor']);

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
  verifiedOnly = false,
}: {
  id: string;
  name: string;
  toolkit?: string;
  logo?: string;
  fallbackLogo?: string;
  size?: 'micro' | 'card' | 'detail';
  /** Use only Xroga's explicit mapped logo or provider metadata, not slug guesses. */
  verifiedOnly?: boolean;
}) {
  const candidates = useMemo(() => {
    const customToolkit =
      toolkit?.toLowerCase().startsWith('custom_') ?? false;

    return [
      // Public marketing cards explicitly pass repository SVGs or provider
      // logos as "logo". Honor that trusted source first when verifiedOnly
      // so outdated CDN mappings never hide real local assets. Existing
      // dashboard behavior remains unchanged.
      ...(verifiedOnly
        ? [!customToolkit ? logo : undefined, getIntegrationLogo(id)]
        : [getIntegrationLogo(id), !customToolkit ? logo : undefined]),
      ...(!customToolkit && !verifiedOnly ? simpleIconCandidates(toolkit, name) : []),
      toolkit && !customToolkit && !verifiedOnly ? composioLogoUrl(toolkit) : undefined,
      fallbackLogo,
    ].filter(
      (value, candidateIndex, all): value is string =>
        typeof value === 'string' &&
        value.length > 0 &&
        all.indexOf(value) === candidateIndex,
    );
  }, [id, logo, fallbackLogo, toolkit, name, verifiedOnly]);

  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
  }, [id, logo, fallbackLogo, toolkit, name, verifiedOnly]);

  const dimension =
    size === 'detail'
      ? 'h-14 w-14 rounded-2xl p-2'
      : size === 'micro'
        ? 'h-6 w-6 rounded-lg p-0.5'
        : 'h-10 w-10 rounded-xl p-1.5';
  const iconSize = size === 'detail' ? 31 : size === 'micro' ? 15 : 22;
  const darkLogoTile = verifiedOnly && WHITE_FOREGROUND_LOCAL_SVGS.has(id.toLowerCase()) &&
    Boolean(candidates[index]?.startsWith('/brand/logos/'));


  if (index < candidates.length) {
    return (
      <img
        src={candidates[index]}
        alt={name}
        loading="lazy"
        referrerPolicy="no-referrer"
        className={`${dimension} shrink-0 border border-[var(--border-subtle)] object-contain`}
        style={{ backgroundColor: darkLogoTile ? '#141414' : '#fff' }}
        data-logo-tone={darkLogoTile ? 'dark' : 'light'}
        onError={() => setIndex((current) => current + 1)}
      />
    );
  }

  return (
    <span
      className={`${dimension} flex shrink-0 items-center justify-center border border-[var(--border-subtle)] bg-[var(--surface-inset)]`}
    >
      {verifiedOnly ? <Blocks size={iconSize} aria-label="App logo unavailable" /> : <IntegrationLogo id={id} name={name} size={iconSize} />}
    </span>
  );
}