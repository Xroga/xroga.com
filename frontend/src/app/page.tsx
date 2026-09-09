import type { Metadata } from 'next';
import { HomepageClient } from '@/components/homepage/HomepageClient';
import { HOMEPAGE_FAQS } from '@/lib/homepageFaq';
import { buildMetadata, buildWebPageJsonLd, PRODUCT_ONE_LINER } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: 'AI App Builder & Coding Agent for Real Software | Xroga',
  description: 'Build real software from a prompt or an existing repository. Xroga implements, verifies, and helps you ship code you own. Start building free.',
  path: '/',
  keywords: ['AI app builder', 'AI coding agent', 'production-ready AI software', 'existing repository AI', 'prompt to software'],
});

const homepageJsonLd = buildWebPageJsonLd({
  path: '/',
  name: 'AI App Builder & Coding Agent for Real Software | Xroga',
  description: PRODUCT_ONE_LINER,
});

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: HOMEPAGE_FAQS.map((item) => ({
    '@type': 'Question',
    name: item.q,
    acceptedAnswer: { '@type': 'Answer', text: item.a },
  })),
};

export default function HomePage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(homepageJsonLd).replace(/</g, '\\u003c') }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd).replace(/</g, '\\u003c') }} />
      <HomepageClient />
    </>
  );
}
