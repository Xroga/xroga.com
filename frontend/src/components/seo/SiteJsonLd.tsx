import {
  buildOrganizationJsonLd,
  buildWebSiteJsonLd,
  buildSiteNavigationJsonLd,
  buildFaqJsonLd,
} from '@/lib/seo';

export function SiteJsonLd() {
  const org = buildOrganizationJsonLd();
  const site = buildWebSiteJsonLd();
  const nav = buildSiteNavigationJsonLd();
  const faq = buildFaqJsonLd();

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(org) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(site) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(nav) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faq) }} />
    </>
  );
}
