import { buildWebPageJsonLd } from '@/lib/seo';

type PageJsonLdProps = Parameters<typeof buildWebPageJsonLd>[0];

export function PageJsonLd(props: PageJsonLdProps) {
  const data = buildWebPageJsonLd(props);
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }}
    />
  );
}
