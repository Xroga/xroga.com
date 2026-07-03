import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { buildMetadata } from '@/lib/seo';
import { getAllFeatureSlugs, getFeatureBySlug } from '@/lib/featureSeo';
import { FeatureLanding } from '@/components/seo/FeatureLanding';

type Props = { params: { slug: string } };

export function generateStaticParams() {
  return getAllFeatureSlugs().map((slug) => ({ slug }));
}

export function generateMetadata({ params }: Props): Metadata {
  const page = getFeatureBySlug(params.slug);
  if (!page) return {};
  return buildMetadata({
    title: page.title,
    description: page.description,
    path: `/features/${page.slug}`,
    keywords: page.keywords,
  });
}

export default function FeatureSlugPage({ params }: Props) {
  const page = getFeatureBySlug(params.slug);
  if (!page) notFound();
  return <FeatureLanding page={page} />;
}
