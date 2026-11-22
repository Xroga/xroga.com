
import type { Metadata } from 'next';
import { HomepageClient } from '@/components/homepage/HomepageClient';
import { buildMetadata, buildWebPageJsonLd } from '@/lib/seo';

// Xroga AI — Homepage SEO
const HOMEPAGE_TITLE =
  'Xroga AI | Superintelligence Workspace for Everything';

const HOMEPAGE_DESCRIPTION =
  'Use an AI assistant and coding agent to research, build apps, create websites, analyze data, and automate connected workflows in one workspace. Start free.';

const HOMEPAGE_KEYWORDS = [
  'Xroga AI',
  'AI assistant',
  'AI workspace',
  'AI agents',
  'AI coding agent',
  'AI app builder',
  'AI website builder',
  'AI automation',
  'AI research',
  'superintelligence',
];

// Google SEO + Open Graph + Twitter + Canonical
export const metadata: Metadata = buildMetadata({
  title: HOMEPAGE_TITLE,
  description: HOMEPAGE_DESCRIPTION,
  path: '/',
  keywords: HOMEPAGE_KEYWORDS,
});

// Homepage structured data
const homepageJsonLd = buildWebPageJsonLd({
  path: '/',
  name: HOMEPAGE_TITLE,
  description: HOMEPAGE_DESCRIPTION,
});

// Preserve existing homepage scroll behavior
const homepageScrollBootstrap = `
  if (!window.location.hash) {
    window.history.scrollRestoration = 'manual';
    window.scrollTo(0, 0);
    document.documentElement.classList.add('xv-home-scroll-lock');
  }
`;

export default function HomePage() {
  return (
    <>
      <script
        dangerouslySetInnerHTML={{
          __html: homepageScrollBootstrap,
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(homepageJsonLd).replace(
            /</g,
            '\\u003c'
          ),
        }}
      />
      <HomepageClient />
    </>
  );
}
