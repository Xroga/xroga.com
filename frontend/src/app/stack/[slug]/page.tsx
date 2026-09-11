import { notFound } from 'next/navigation';
import { EditorialPage } from '@/components/seo/EditorialPage';
import { STACK_GUIDES } from '@/lib/seoExpansionContent';
import { buildMetadata } from '@/lib/seo';

export function generateStaticParams() { return STACK_GUIDES.map(({ slug }) => ({ slug })); }
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) { const { slug } = await params; const page = STACK_GUIDES.find((item) => item.slug === slug); return page ? buildMetadata({ title: page.title, description: page.description, path: `/stack/${slug}` }) : {}; }
export default async function Page({ params }: { params: Promise<{ slug: string }> }) { const { slug } = await params; const page = STACK_GUIDES.find((item) => item.slug === slug); if (!page) notFound(); return <EditorialPage path={`/stack/${slug}`} title={page.title} description={page.description} eyebrow="Technology guide" intro={page.intro} updated={page.reviewed} sources={page.sources} related={page.related} breadcrumbs={[{ label: 'Stack', href: '/stack' }, { label: page.slug, href: `/stack/${slug}` }]} sections={page.sections} />; }
