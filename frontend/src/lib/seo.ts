import type { Metadata } from 'next';

export const SITE_URL = 'https://xroga.com';
export const SITE_NAME = 'Xroga AI';
export const FAVICON_URL = 'https://i.postimg.cc/k52s32y9/XROGA01-removebg-preview.png';
export const FAVICON_LOCAL = '/favicon.png';

export const DEFAULT_DESCRIPTION =
  'Xroga AI is the AI Swarm Operating System — 710+ integrations, multi-agent Architect·Builder·Reviewer·QA workflows, browser automation, and action-based billing. Built by Muhammad Ibrahim, 19, from Pakistan.';

/** Brand + typo + related search terms for discoverability */
export const DEFAULT_KEYWORDS = [
  'Xroga AI',
  'Xroga',
  'xroga.com',
  'x roga',
  'roga AI',
  'roga ai platform',
  'droga',
  'droga AI',
  'droga ai tool',
  'xroga swarm',
  'xroga automation',
  'xroga browser',
  'AI Swarm',
  'AI operating system',
  'multi-agent AI',
  'browser automation AI',
  'build apps with AI',
  'Muhammad Ibrahim',
  'Pakistan AI startup',
  'AI code generation',
  'AI automation platform',
  'AI swarm OS',
  'action-based AI pricing',
  '710 integrations AI',
  'zero defects swarm',
  'Vercel deploy AI',
  'GitHub AI builder',
];

export function buildMetadata({
  title,
  description,
  path = '',
  keywords = [],
}: {
  title?: string;
  description?: string;
  path?: string;
  keywords?: string[];
}): Metadata {
  const fullTitle = title ? `${title} | ${SITE_NAME}` : `${SITE_NAME} — AI Swarm Operating System`;
  const desc = description ?? DEFAULT_DESCRIPTION;
  const url = `${SITE_URL}${path}`;

  return {
    title: fullTitle,
    description: desc,
    keywords: [...DEFAULT_KEYWORDS, ...keywords],
    metadataBase: new URL(SITE_URL),
    alternates: { canonical: url },
    openGraph: {
      type: 'website',
      locale: 'en_US',
      url,
      siteName: SITE_NAME,
      title: fullTitle,
      description: desc,
      images: [{ url: FAVICON_URL, width: 512, height: 512, alt: SITE_NAME }],
    },
    twitter: {
      card: 'summary_large_image',
      title: fullTitle,
      description: desc,
      images: [FAVICON_URL],
    },
    robots: { index: true, follow: true, googleBot: { index: true, follow: true } },
    authors: [{ name: 'Muhammad Ibrahim', url: `${SITE_URL}/about` }],
    creator: 'Muhammad Ibrahim',
    publisher: SITE_NAME,
    category: 'technology',
  };
}

/** JSON-LD for rich search results */
export function buildOrganizationJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: SITE_NAME,
    alternateName: ['Xroga', 'Xroga Swarm', 'Roga AI', 'Droga AI'],
    applicationCategory: 'DeveloperApplication',
    operatingSystem: 'Web',
    url: SITE_URL,
    description: DEFAULT_DESCRIPTION,
    offers: {
      '@type': 'AggregateOffer',
      lowPrice: '19',
      highPrice: '999',
      priceCurrency: 'USD',
      offerCount: 5,
    },
    author: {
      '@type': 'Person',
      name: 'Muhammad Ibrahim',
      url: `${SITE_URL}/about`,
    },
    publisher: {
      '@type': 'Organization',
      name: SITE_NAME,
      url: SITE_URL,
      logo: FAVICON_URL,
    },
  };
}

export function buildWebSiteJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    alternateName: ['xroga', 'roga ai', 'droga ai'],
    url: SITE_URL,
    potentialAction: {
      '@type': 'SearchAction',
      target: `${SITE_URL}/dashboard?q={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  };
}
