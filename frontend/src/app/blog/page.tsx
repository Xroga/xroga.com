import { EditorialHub } from '@/components/seo/EditorialPage';
import { BLOG_ARTICLES } from '@/lib/seoGrowthContent';
import { buildMetadata } from '@/lib/seo';

export const metadata = buildMetadata({ title: 'AI App Builder Blog: Free Tools, Prompts & MVP Guides | Xroga', description: 'Practical guides to free AI app builders, choosing tools, building apps, writing prompts, and launching an MVP, plus Xroga’s existing software guides.', path: '/blog' });
export default function Page() {
  return <EditorialHub path="/blog" title="Guides for building software with AI responsibly."
    description={metadata.description as string} eyebrow="Xroga learning library"
    intro="Clear explanations and decision frameworks for moving from generated output to software a team can inspect, operate, and improve."
    items={BLOG_ARTICLES.map((article) => ({ href: `/blog/${article.slug}`, title: article.title, description: article.description, meta: `Updated ${article.updated ?? '2026-09-09'}` }))} />;
}
