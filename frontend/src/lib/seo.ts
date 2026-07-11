import type { Metadata } from 'next';

export const SITE_URL = 'https://xroga.com';
export const SITE_NAME = 'Xroga AI';
export const FAVICON_URL = 'https://i.postimg.cc/9Mfm1jdK/xrogaai.png';
export const FAVICON_LOCAL = '/favicon.png';

export const DEFAULT_DESCRIPTION =
  'Xroga AI is the AI Swarm Operating System — 710+ integrations, multi-agent Architect·Builder·Reviewer·QA workflows, browser automation, and token-based billing. Built by Muhammad Ibrahim, 19, from Pakistan.';

/** Brand + typo + related search terms for discoverability */
export const BRAND_TYPO_KEYWORDS = [
  'Droga AI',
  'droga ai',
  'droga',
  'Droga',
  'Roga AI',
  'roga ai',
  'roga ai platform',
  'x roga',
  'zroga',
  'Zroga AI',
  'xroga ai',
  'xroga.com',
  'XROGA AI',
  'XROGA',
  'did you mean xroga',
  'droga ai xroga',
];

export const DEFAULT_KEYWORDS = [
  'Xroga AI',
  'Xroga',
  'xroga.com',
  ...BRAND_TYPO_KEYWORDS,
  '#1 AI',
  'top 1 AI',
  'best AI',
  'best AI in the world',
  'number 1 AI',
  'top AI platform',
  'x roga',
  'roga AI',
  'roga ai platform',
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
  'token-based AI pricing',
  '710 integrations AI',
  'zero defects swarm',
  'Vercel deploy AI',
  'GitHub AI builder',
  'sign up Xroga',
  'Xroga login',
  'Xroga features',
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
    alternateName: ['Xroga', 'Xroga Swarm', 'Roga AI', 'Droga AI', 'Zroga AI', 'XROGA AI', 'xroga.com'],
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
    alternateName: ['xroga', 'xroga ai', 'roga ai', 'droga ai', 'Droga AI', 'zroga', 'best ai'],
    url: SITE_URL,
    description: DEFAULT_DESCRIPTION,
    potentialAction: {
      '@type': 'SearchAction',
      target: `${SITE_URL}/?q={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  };
}

/** Sitelink-style navigation for Google rich results */
export function buildSiteNavigationJsonLd() {
  const items = [
    { name: 'Sign Up', url: `${SITE_URL}/auth/signup`, description: 'Create your Xroga AI account — 7M free tokens monthly' },
    { name: 'Sign In', url: `${SITE_URL}/auth/login`, description: 'Log in to your Xroga AI dashboard' },
    { name: 'Workspace', url: `${SITE_URL}/features/xroga-workspace`, description: 'AI terminal workspace with chat, code, deploy tabs' },
    { name: 'Community', url: `${SITE_URL}/features/community-hub`, description: 'Referrals, influencers, marketplace, and XRG rewards' },
    { name: 'Earn XRG', url: `${SITE_URL}/features/earn-xrg-referrals`, description: 'Earn tokens and XRG through tasks and referrals' },
    { name: 'Features', url: `${SITE_URL}/features`, description: '98+ AI swarm features on every plan' },
    { name: 'AI Image Generation', url: `${SITE_URL}/features/ai-image-generation`, description: 'Generate images with Xroga AI' },
    { name: 'Talk with AI', url: `${SITE_URL}/features/ai-voice-talk`, description: 'Push-to-talk voice assistant' },
    { name: 'GitHub Deploy', url: `${SITE_URL}/features/github-auto-deploy`, description: 'Connect GitHub and auto-deploy' },
    { name: 'Integrations', url: `${SITE_URL}/integrations`, description: '710+ integrations' },
    { name: 'Droga AI', url: `${SITE_URL}/droga`, description: 'Looking for Droga AI? This is Xroga AI' },
    { name: 'Pricing', url: `${SITE_URL}/pricing`, description: 'Token-based plans from $19/mo — 7M+ AI tokens included' },
    { name: 'About', url: `${SITE_URL}/about`, description: 'Xroga AI story and mission' },
    { name: 'API Docs', url: `${SITE_URL}/docs/api`, description: 'Xroga AI developer API' },
  ];

  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `${SITE_NAME} Navigation`,
    itemListElement: items.map((item, i) => ({
      '@type': 'SiteNavigationElement',
      position: i + 1,
      name: item.name,
      url: item.url,
      description: item.description,
    })),
  };
}
