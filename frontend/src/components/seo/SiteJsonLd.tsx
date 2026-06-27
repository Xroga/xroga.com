import { buildOrganizationJsonLd, buildWebSiteJsonLd } from '@/lib/seo';

export function SiteJsonLd() {
  const org = buildOrganizationJsonLd();
  const site = buildWebSiteJsonLd();

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(org) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(site) }} />
    </>
  );
}
