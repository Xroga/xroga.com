import type { FeatureSeoPage } from '@/lib/featureSeo';
import { SITE_NAME, SITE_URL } from '@/lib/seo';

export function FeatureJsonLd({ page }: { page: FeatureSeoPage }) {
  const url = `${SITE_URL}/features/${page.slug}`;

  const webPage = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: page.headline,
    description: page.description,
    url,
    isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: SITE_URL },
    about: {
      '@type': 'SoftwareApplication',
      name: SITE_NAME,
      applicationCategory: 'DeveloperApplication',
      operatingSystem: 'Web',
    },
  };

  const faq =
    page.faq.length > 0
      ? {
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          mainEntity: page.faq.map((item) => ({
            '@type': 'Question',
            name: item.q,
            acceptedAnswer: { '@type': 'Answer', text: item.a },
          })),
        }
      : null;

  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: 'Features', item: `${SITE_URL}/features` },
      { '@type': 'ListItem', position: 3, name: page.title, item: url },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(webPage) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />
      {faq && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faq) }} />
      )}
    </>
  );
}
