import { EditorialHub } from '@/components/seo/EditorialPage';
import { STACK_GUIDES } from '@/lib/seoExpansionContent';
import { buildMetadata } from '@/lib/seo';

export const metadata = buildMetadata({ title: 'Build With Modern Software Stacks', description: 'Production-focused guides for using Xroga with real Next.js, React, TypeScript, and Python repositories without replacing their architecture.', path: '/stack' });
export default function Page() { return <EditorialHub path="/stack" title="Work with the stack your product actually uses." description={metadata.description as string} eyebrow="Technology guides" intro="These guides explain the repository signals, boundaries, checks, and release evidence that matter for each technology. Xroga does not force every project into one framework." items={STACK_GUIDES.map((item) => ({ href: `/stack/${item.slug}`, title: item.title, description: item.description, meta: `Reviewed ${item.reviewed}` }))} />; }
