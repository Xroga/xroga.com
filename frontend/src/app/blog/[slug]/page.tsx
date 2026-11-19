import { notFound } from 'next/navigation';
import { EditorialPage } from '@/components/seo/EditorialPage';
import { BLOG_ARTICLES } from '@/lib/seoGrowthContent';
import { buildMetadata } from '@/lib/seo';
import { SITE_URL } from '@/lib/seo';

export function generateStaticParams() { return BLOG_ARTICLES.map(({ slug }) => ({ slug })); }
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = BLOG_ARTICLES.find((item) => item.slug === slug);
  if (!article) return {};
  const base = buildMetadata({ title: article.title, description: article.description, path: `/blog/${slug}` });
  const attributed = { ...base, authors: [{ name: article.authorName || 'Xroga Editorial', url: `${SITE_URL}/about` }] };
  if (!article.visual) return attributed;
  const image = `${SITE_URL}${article.visual.src}`;
  return { ...attributed, openGraph: { type: 'article' as const, url: `${SITE_URL}/blog/${slug}`, title: article.title, description: article.description, images: [{ url: image, alt: article.visual.alt }] }, twitter: { card: 'summary_large_image' as const, title: article.title, description: article.description, images: [image] } };
}
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = BLOG_ARTICLES.find((item) => item.slug === slug);
  if (!article) notFound();
  return <EditorialPage path={`/blog/${slug}`} title={article.title} description={article.description}
    eyebrow={article.eyebrow} intro={article.intro} article updated={article.updated ?? '2026-09-09'} authorName={article.authorName} readingMinutes={article.readingMinutes} publishedAt={article.publishedAt} explain={article.explain}
    breadcrumbs={[{ label: 'Guides', href: '/blog' }, { label: article.title, href: `/blog/${slug}` }]}
    related={article.related} sources={article.sources} sections={article.sections}
    visuals={article.visual ? [{ type: 'EDITORIAL_IMAGE', ...article.visual, verified: article.updated ?? '' }] : []} />;
}
