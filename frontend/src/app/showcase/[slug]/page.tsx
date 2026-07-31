import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { buildMetadata } from '@/lib/seo';
import { getAllShowcaseSlugs, getShowcaseBySlug, previewRouteFor } from '@/lib/showcase/registry';
import { ShowcaseDetail } from '@/components/showcase/ShowcaseDetail';

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return getAllShowcaseSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const template = getShowcaseBySlug(slug);
  if (!template) return {};
  return buildMetadata({
    title: `${template.name} — Built with Xroga AI`,
    description: template.shortDescription,
    path: `/showcase/${template.slug}`,
    keywords: [template.name, template.category, 'Xroga AI template', ...template.technologies],
  });
}

export default async function ShowcaseDetailPage({ params }: Props) {
  const { slug } = await params;
  const template = getShowcaseBySlug(slug);
  if (!template) notFound();

  return (
    <main className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:py-16">
      <nav aria-label="Breadcrumb" className="mb-6 text-xs text-[var(--text-muted)]">
        <Link href="/" className="hover:text-[var(--text-primary)]">
          Xroga
        </Link>
        <span aria-hidden className="mx-1.5">/</span>
        <Link href="/showcase" className="hover:text-[var(--text-primary)]">
          Showcase
        </Link>
        <span aria-hidden className="mx-1.5">/</span>
        <span className="text-[var(--text-secondary)]">{template.name}</span>
      </nav>

      <ShowcaseDetail template={template} previewRoute={previewRouteFor(template)} />
    </main>
  );
}
