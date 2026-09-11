import { notFound } from 'next/navigation';
import { EditorialPage } from '@/components/seo/EditorialPage';
import { MIGRATION_GUIDES } from '@/lib/seoExpansionContent';
import { buildMetadata } from '@/lib/seo';

export function generateStaticParams() { return MIGRATION_GUIDES.map(({ slug }) => ({ slug })); }
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) { const { slug } = await params; const page = MIGRATION_GUIDES.find((item) => item.slug === slug); return page ? buildMetadata({ title: page.title, description: page.description, path: `/migrate/${slug}` }) : {}; }
export default async function Page({ params }: { params: Promise<{ slug: string }> }) { const { slug } = await params; const page = MIGRATION_GUIDES.find((item) => item.slug === slug); if (!page) notFound(); return <EditorialPage path={`/migrate/${slug}`} title={page.title} description={page.description} eyebrow="Migration guide" intro={page.intro} updated={page.reviewed} note="Keep the original production path available until the replacement has passed its own checks. A repository export does not prove that data, secrets, or hosted services moved with it." sources={page.sources} related={page.related} breadcrumbs={[{ label: 'Migrate', href: '/migrate' }, { label: page.slug, href: `/migrate/${slug}` }]} sections={page.sections} />; }
