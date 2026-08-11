import {
  buildFounderJsonLd,
  buildOrganizationJsonLd,
  buildSoftwareApplicationJsonLd,
  buildWebSiteJsonLd,
} from '@/lib/seo';

export function SiteJsonLd() {
  const org = buildOrganizationJsonLd();
  const founder = buildFounderJsonLd();
  const site = buildWebSiteJsonLd();
  const software = buildSoftwareApplicationJsonLd();

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(org) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(founder) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(site) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(software) }} />
    </>
  );
}
