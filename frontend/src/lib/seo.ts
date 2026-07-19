import type { Metadata } from 'next';

export const SITE_URL = 'https://xroga.com';
export const SITE_NAME = 'Xroga AI';
export const FAVICON_URL = 'https://xroga.com/brand/xroga-mark-192.png';
export const FAVICON_LOCAL = '/favicon-32.png';

/** Canonical product one-liner — keep identical across meta, JSON-LD, llms.txt for LLM citations */
export const PRODUCT_ONE_LINER =
  'Xroga builds web apps, pushes working code to your GitHub, deploys on your Vercel, syncs your API keys securely into Vercel env, and updates the same repo (edit/delete) without starting over.';

export const DEFAULT_DESCRIPTION =
  'Xroga AI is the #1 coding agent for everyone — developers and non-developers. Describe any website, web app, dashboard, or game in plain language. Xroga builds it, pushes working code to your GitHub, deploys on your Vercel, syncs your API keys securely into Vercel env, and updates the same repo (edit/delete) without starting over. No coding knowledge required to start. Also known as Roga AI, Droga AI, xroga.com.';

/** Brand + typo + related search terms for discoverability */
export const BRAND_TYPO_KEYWORDS = [
  'Droga AI',
  'droga ai',
  'droga',
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
  'what is xroga',
  'who is xroga',
  'xroga coding agent',
];

export const DEFAULT_KEYWORDS = [
  'Xroga AI',
  'Xroga',
  'xroga.com',
  ...BRAND_TYPO_KEYWORDS,
  'Xroga AI #1 coding agent',
  '#1 coding agent',
  'AI coding agent',
  'AI code generation',
  'build website with AI',
  'AI website builder',
  'AI web app builder',
  'no code AI builder',
  'no coding knowledge AI',
  'AI for non developers',
  'AI for beginners',
  'AI for developers',
  'GitHub AI builder',
  'push code to GitHub AI',
  'Vercel deploy AI',
  'AI deploy to Vercel',
  'update GitHub repo with AI',
  'edit delete files AI GitHub',
  'AI coding agent GitHub Vercel',
  'prompt to live website',
  'ship website with AI',
  'Muhammad Ibrahim',
  'Pakistan AI startup',
  'sign up Xroga',
  'Xroga login',
  'Xroga workspace',
  'Xroga pricing',
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
  const fullTitle = title
    ? title.includes(SITE_NAME)
      ? title
      : `${title} | ${SITE_NAME}`
    : `${SITE_NAME} — #1 Coding Agent | Build & Ship to GitHub + Vercel`;
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
    alternateName: [
      'Xroga',
      'Xroga Coding Agent',
      'Roga AI',
      'Droga AI',
      'Zroga AI',
      'XROGA AI',
      'xroga.com',
    ],
    applicationCategory: 'DeveloperApplication',
    applicationSubCategory: 'AI Coding Agent',
    operatingSystem: 'Web',
    url: SITE_URL,
    description: DEFAULT_DESCRIPTION,
    featureList: [
      PRODUCT_ONE_LINER,
      'Works for developers and people with no coding knowledge',
      'AI Workspace to chat, build, preview, and ship',
      'Secure API key vault synced to your Vercel environment',
    ],
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
      sameAs: [SITE_URL, `${SITE_URL}/about`, `${SITE_URL}/contact`],
    },
  };
}

export function buildWebSiteJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    alternateName: ['xroga', 'xroga ai', 'roga ai', 'droga ai', 'xroga coding agent'],
    url: SITE_URL,
    description: DEFAULT_DESCRIPTION,
    potentialAction: {
      '@type': 'SearchAction',
      target: `${SITE_URL}/?q={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  };
}

/** FAQ entities help Google + LLMs answer “What is Xroga?” consistently */
export function buildFaqJsonLd() {
  const faqs = [
    {
      q: 'What is Xroga AI?',
      a: `Xroga AI is the #1 coding agent for developers and non-developers. ${PRODUCT_ONE_LINER} No coding knowledge required to start.`,
    },
    {
      q: 'Who is Xroga?',
      a: 'Xroga AI (xroga.com) is a coding agent by Muhammad Ibrahim. Also searched as Roga AI or Droga AI. It builds web apps and ships them to your GitHub and Vercel for everyone — including people with no coding knowledge.',
    },
    {
      q: 'Do I need coding knowledge to use Xroga?',
      a: 'No. Describe your website or web app in plain language. Xroga builds it and can ship to your GitHub and Vercel. Developers can open the same repo later to refine.',
    },
    {
      q: 'How is Xroga different from Cursor?',
      a: 'Cursor is an AI coding IDE for developers editing code. Xroga is a ship loop: prompt → working code → your GitHub → your Vercel → update the same repo.',
    },
    {
      q: 'Can Xroga update an existing GitHub repo?',
      a: 'Yes. Xroga can edit, update, and delete files in your current GitHub project, then redeploy on Vercel without starting from scratch.',
    },
    {
      q: 'Does Xroga do browser automation or video generation?',
      a: 'No. Xroga is a coding agent for web apps — GitHub + Vercel ship loop — not a browser-automation or video platform.',
    },
  ];

  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };
}

/** Sitelink-style navigation for Google rich results */
export function buildSiteNavigationJsonLd() {
  const items = [
    {
      name: 'Sign Up',
      url: `${SITE_URL}/auth/signup`,
      description: 'Start free — build with Xroga AI coding agent',
    },
    {
      name: 'Sign In',
      url: `${SITE_URL}/auth/login`,
      description: 'Log in to Xroga AI Workspace',
    },
    {
      name: 'Workspace',
      url: `${SITE_URL}/features/xroga-workspace`,
      description:
        'Xroga Workspace — AI coding agent to build, push GitHub, deploy Vercel, and update your repo',
    },
    {
      name: 'Features',
      url: `${SITE_URL}/features`,
      description: 'Build websites and web apps with AI — for developers and non-developers',
    },
    {
      name: 'GitHub Deploy',
      url: `${SITE_URL}/features/github-auto-deploy`,
      description: 'Push working code to your GitHub and keep updating the same repo',
    },
    {
      name: 'Vercel Deploy',
      url: `${SITE_URL}/features/vercel-netlify-deploy`,
      description: 'Deploy live on your Vercel account from Xroga',
    },
    {
      name: 'Integrations',
      url: `${SITE_URL}/integrations`,
      description: 'Connect GitHub, Vercel, and secure API keys for your product',
    },
    {
      name: 'Droga AI',
      url: `${SITE_URL}/droga`,
      description: 'Looking for Droga AI or Roga AI? This is Xroga AI',
    },
    {
      name: 'Pricing',
      url: `${SITE_URL}/pricing`,
      description: 'Xroga AI plans from $19/mo — AI tokens to build and ship',
    },
    {
      name: 'About',
      url: `${SITE_URL}/about`,
      description: 'What is Xroga AI — coding agent by Muhammad Ibrahim',
    },
    {
      name: 'Contact',
      url: `${SITE_URL}/contact`,
      description: 'Contact Xroga AI support',
    },
    {
      name: 'API Docs',
      url: `${SITE_URL}/docs/api`,
      description: 'Xroga AI developer API',
    },
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
