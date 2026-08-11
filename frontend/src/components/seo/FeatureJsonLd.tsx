import type { FeatureSeoPage } from '@/lib/featureSeo';
import { ORGANIZATION_ID, SITE_URL, SOFTWARE_ID, WEBSITE_ID } from '@/lib/seo';

export function FeatureJsonLd({ page }: { page: FeatureSeoPage }) {
  const url = `${SITE_URL}/features/${page.slug}`;

  const webPage = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    '@id': `${url}#webpage`,
    name: page.headline,
    description: page.description,
    url,
    isPartOf: { '@id': WEBSITE_ID },
    about: { '@id': SOFTWARE_ID },
    publisher: { '@id': ORGANIZATION_ID },
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
