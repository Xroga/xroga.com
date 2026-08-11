import type { Metadata } from 'next';
import { ABOUT_FOUNDER, ABOUT_SOCIALS } from '@/lib/aboutContent';
import { COMPANY_CONTACT } from '@/lib/companyContact';

export const SITE_URL = 'https://xroga.com';
export const SITE_NAME = 'XROGA AI';
export const SITE_ALTERNATE_NAME = 'XROGA';
export const ORGANIZATION_ID = `${SITE_URL}/#organization`;
export const WEBSITE_ID = `${SITE_URL}/#website`;
export const SOFTWARE_ID = `${SITE_URL}/#software`;
export const FOUNDER_ID = `${SITE_URL}/#founder`;
export const LOGO_ID = `${SITE_URL}/#logo`;
export const FAVICON_URL = `${SITE_URL}/brand/xroga-mark-192.png`;
export const OG_IMAGE_URL = 'https://xroga.com/opengraph-image';
export const OFFICIAL_SOCIAL_URLS = [ABOUT_SOCIALS.x, ABOUT_SOCIALS.github] as const;

/** Canonical product one-liner — keep identical across meta, JSON-LD, llms.txt for LLM citations */
export const PRODUCT_ONE_LINER =
  'Xroga is an AI coding and product-building agent that helps users research, build, test, repair, connect repositories, and deploy applications.';

export const DEFAULT_DESCRIPTION =
  'Describe a supported software outcome in plain language. Xroga inspects the connected project, applies focused changes, runs applicable validation, and returns publishing evidence or the exact external setup required.';

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
    ? /xroga(?: ai)?/i.test(title)
      ? title
      : `${title} | ${SITE_NAME}`
    : `${SITE_NAME} — Build, verify, and publish software`;
  const desc = description ?? DEFAULT_DESCRIPTION;
  const url = `${SITE_URL}${path}`;
  const isPreviewDeployment = process.env.VERCEL_ENV === 'preview';

  return {
    title: fullTitle,
    description: desc,
    keywords: keywords.length > 0 ? keywords : undefined,
    metadataBase: new URL(SITE_URL),
    alternates: { canonical: url },
    openGraph: {
      type: 'website',
      locale: 'en_US',
      url,
      siteName: SITE_NAME,
      title: fullTitle,
      description: desc,
      images: [{ url: OG_IMAGE_URL, width: 1200, height: 630, alt: 'Xroga AI — research, build, test, repair, and deploy software' }],
    },
    twitter: {
      card: 'summary_large_image',
      title: fullTitle,
      description: desc,
      images: [OG_IMAGE_URL],
    },
    robots: isPreviewDeployment
      ? { index: false, follow: false }
      : { index: true, follow: true, googleBot: { index: true, follow: true } },
    authors: [{ name: ABOUT_FOUNDER.name, url: `${SITE_URL}/about` }],
    creator: ABOUT_FOUNDER.name,
    publisher: SITE_NAME,
    category: 'technology',
  };
}

/** Canonical organization entity. Unknown legal identifiers are intentionally omitted. */
export function buildOrganizationJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': ORGANIZATION_ID,
    name: SITE_NAME,
    alternateName: [SITE_ALTERNATE_NAME, 'Xroga AI'],
    legalName: COMPANY_CONTACT.legalName,
    url: `${SITE_URL}/`,
    logo: {
      '@type': 'ImageObject',
      '@id': LOGO_ID,
      url: FAVICON_URL,
      contentUrl: FAVICON_URL,
      width: 500,
      height: 500,
    },
    description: PRODUCT_ONE_LINER,
    email: `mailto:${COMPANY_CONTACT.email}`,
    founder: { '@id': FOUNDER_ID },
    sameAs: [...OFFICIAL_SOCIAL_URLS],
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'customer support',
      email: COMPANY_CONTACT.email,
      telephone: COMPANY_CONTACT.phoneTel,
      availableLanguage: ['English'],
    },
  };
}
export function buildFounderJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    '@id': FOUNDER_ID,
    name: ABOUT_FOUNDER.name,
    jobTitle: ABOUT_FOUNDER.role,
    url: `${SITE_URL}/about#founder`,
    worksFor: { '@id': ORGANIZATION_ID },
  };
}

export function buildSoftwareApplicationJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    '@id': SOFTWARE_ID,
    name: SITE_NAME,
    alternateName: SITE_ALTERNATE_NAME,
    applicationCategory: 'DeveloperApplication',
    applicationSubCategory: 'AI Coding Agent',
    operatingSystem: 'Web',
    url: `${SITE_URL}/`,
    description: PRODUCT_ONE_LINER,
    featureList: [
      PRODUCT_ONE_LINER,
      'Works for developers and people with no coding knowledge',
      'AI Workspace to chat, build, preview, and ship',
      'Server-side integration vault and authorised provider operations',
    ],
    offers: {
      '@type': 'Offer',
      price: '19',
      priceCurrency: 'USD',
      description: 'One Xroga AI plan; current eligibility and capacity are shown before checkout.',
    },
    author: { '@id': FOUNDER_ID },
    publisher: { '@id': ORGANIZATION_ID },
  };
}

export function buildWebSiteJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': WEBSITE_ID,
    name: SITE_NAME,
    alternateName: SITE_ALTERNATE_NAME,
    url: `${SITE_URL}/`,
    description: PRODUCT_ONE_LINER,
    publisher: { '@id': ORGANIZATION_ID },
  };
}

export function buildWebPageJsonLd({
  path,
  name,
  description,
  type = 'WebPage',
}: {
  path: string;
  name: string;
  description: string;
  type?: 'WebPage' | 'AboutPage' | 'ContactPage' | 'CollectionPage';
}) {
  const url = `${SITE_URL}${path}`;
  return {
    '@context': 'https://schema.org',
    '@type': type,
    '@id': `${url}#webpage`,
    url,
    name,
    description,
    isPartOf: { '@id': WEBSITE_ID },
    about: { '@id': ORGANIZATION_ID },
    publisher: { '@id': ORGANIZATION_ID },
    primaryImageOfPage: path === '/' ? { '@id': LOGO_ID } : undefined,
  };
}
