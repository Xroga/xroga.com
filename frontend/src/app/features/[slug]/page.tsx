import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { buildMetadata } from '@/lib/seo';
import { getAllFeatureSlugs, getFeatureBySlug } from '@/lib/featureSeo';
import { FeatureLanding } from '@/components/seo/FeatureLanding';

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  // AI Chat has a dedicated product page. Keep the legacy feature registry entry
  // available for related-link labels without letting dynamic prerendering overwrite it.
  return getAllFeatureSlugs()
    .filter((slug) => slug !== 'ai-chat')
    .map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = getFeatureBySlug(slug);
  if (!page) return {};
  return buildMetadata({
    title: page.title,
    description: page.description,
    path: `/features/${page.slug}`,
    keywords: page.keywords,
  });
}

export default async function FeatureSlugPage({ params }: Props) {
  const { slug } = await params;
  const page = getFeatureBySlug(slug);
  if (!page) notFound();
  return <FeatureLanding page={page} />;
}
