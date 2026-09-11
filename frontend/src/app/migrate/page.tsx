import { EditorialHub } from '@/components/seo/EditorialPage';
import { MIGRATION_GUIDES } from '@/lib/seoExpansionContent';
import { buildMetadata } from '@/lib/seo';

export const metadata = buildMetadata({ title: 'Migrate AI-Built Projects Without Losing Control', description: 'Evidence-based migration guides for moving AI-built projects into a repository-led workflow while preserving source, services, and rollback paths.', path: '/migrate' });
export default function Page() { return <EditorialHub path="/migrate" title="Move the product, not just the generated files." description={metadata.description as string} eyebrow="Migration guides" intro="A safe migration identifies which assets are portable, which capabilities remain provider-owned, and what must be proven before production traffic moves." items={MIGRATION_GUIDES.map((item) => ({ href: `/migrate/${item.slug}`, title: item.title, description: item.description, meta: `Sources reviewed ${item.reviewed}` }))} />; }
