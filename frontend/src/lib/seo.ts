import type { Metadata } from 'next';

export const SITE_URL = 'https://xroga.com';
export const SITE_NAME = 'Xroga AI';
export const FAVICON_URL =
  'https://i.postimg.cc/bJnL5jV7/Red-and-Blue-Modern-X-letter-Digital-Marketing-Logo-1-removebg-preview-1.png';

export const DEFAULT_DESCRIPTION =
  'Xroga AI is the AI Swarm Operating System — 710+ integrations, multi-agent Architect·Builder·Reviewer·QA workflows, browser automation, and action-based billing. Built by Muhammad Ibrahim, 19, from Pakistan.';

export const DEFAULT_KEYWORDS = [
  'Xroga AI',
  'AI Swarm',
  'AI operating system',
  'multi-agent AI',
  'browser automation AI',
  'build apps with AI',
  'Muhammad Ibrahim',
  'Pakistan AI startup',
  'AI code generation',
  'AI automation platform',
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
  };
}
