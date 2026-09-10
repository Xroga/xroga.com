import type { Metadata } from 'next';
import { DocsDirectory } from '@/components/docs/DocsDirectory';
import { PageJsonLd } from '@/components/seo/PageJsonLd';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({ title: 'Xroga Documentation — Build, Test and Publish', description: 'Practical guides for Xroga Workspace, GitHub, Vercel, repositories, testing, repairs, publishing, security, and hackathon workflows.', path: '/docs', keywords: ['Xroga documentation', 'AI coding agent guide', 'Xroga GitHub', 'Xroga Vercel'] });

export default function DocsPage() {
  return (
    <main className="min-h-screen bg-[var(--surface-page)] text-[var(--text-primary)]">
      <PageJsonLd path="/docs" name="XROGA AI documentation" description="Guides for XROGA AI repository work, validation, GitHub, Vercel, publishing, integrations, and security." type="CollectionPage" />
      <section className="mx-auto max-w-6xl px-4 py-12">
        <p className="text-xs font-black uppercase tracking-[.2em] text-[var(--accent)]">Product documentation</p>
        <h1 className="mt-2 text-4xl font-black tracking-tight sm:text-6xl">Build with evidence.</h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--text-secondary)]">Learn the real Xroga flow—from a clear outcome to repository changes, validation, provider operations, and verified results.</p>
        <div className="mt-9"><DocsDirectory /></div>
      </section>
    </main>
  );
}
