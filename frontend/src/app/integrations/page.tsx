import type { Metadata } from 'next';
import Link from 'next/link';
import { buildMetadata, SITE_URL } from '@/lib/seo';
import { INTEGRATION_CATEGORIES, INTEGRATIONS } from '@/lib/integrations';

export const metadata: Metadata = buildMetadata({
  title: 'Integrations — GitHub, Vercel & Secure API Keys',
  description:
    'Connect GitHub and Vercel to Xroga AI coding agent. Push working code, deploy live, and sync your product API keys securely into Vercel env — for developers and non-developers.',
  path: '/integrations',
  keywords: [
    'Xroga integrations',
    'GitHub Vercel AI integration',
    'sync API keys Vercel',
    'AI coding agent integrations',
    'connect API keys AI',
  ],
});

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: 'Xroga AI Integrations',
  description: `${INTEGRATIONS.length}+ integrations for Xroga AI`,
  url: `${SITE_URL}/integrations`,
};

export default function IntegrationsSeoPage() {
  const topIntegrations = INTEGRATIONS.filter((i) =>
    ['github', 'vercel', 'netlify', 'stripe', 'slack', 'openai', 'google', 'supabase', 'aws', 'notion'].some(
      (k) => i.id.includes(k) || i.name.toLowerCase().includes(k)
    )
  ).slice(0, 24);

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
        <header className="border-b border-[var(--card-border)] px-4 sm:px-8 py-6">
          <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-4">
            <Link href="/" className="text-sm font-bold text-[var(--accent)] hover:underline">
              ← Xroga AI
            </Link>
            <Link
              href="/auth/signup"
              className="px-3 py-1 rounded-full bg-[var(--accent)] text-[var(--background)] font-semibold text-sm"
            >
              Sign Up Free
            </Link>
          </div>
        </header>

        <main className="max-w-5xl mx-auto px-4 sm:px-8 py-10">
          <h1 className="text-3xl sm:text-4xl font-extrabold mb-3">
            {INTEGRATIONS.length}+ Integrations on Xroga AI
          </h1>
          <p className="text-[var(--muted)] mb-8 leading-relaxed max-w-3xl">
            Connect GitHub, Vercel, Netlify, payment providers, AI APIs, and {INTEGRATION_CATEGORIES.length}{' '}
            categories of tools. Xroga routes swarm tasks to the right integration automatically.
          </p>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2 mb-10">
            {topIntegrations.map((i) => (
              <div
                key={i.id}
                className="p-3 rounded-xl border border-[var(--card-border)] bg-[var(--card)]/40 text-sm"
              >
                <p className="font-semibold">{i.name}</p>
                <p className="text-xs text-[var(--muted)]">{i.category}</p>
              </div>
            ))}
          </div>

          <p className="text-sm text-[var(--muted)] mb-6">
            Full catalog available after sign-in on the dashboard. Featured categories:{' '}
            {INTEGRATION_CATEGORIES.slice(0, 12).join(', ')}, and more.
          </p>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/features/integrations"
              className="px-5 py-2.5 rounded-xl border border-[var(--card-border)] font-semibold text-sm hover:border-[var(--accent)]"
            >
              Integrations Feature Page
            </Link>
            <Link
              href="/features/github-auto-deploy"
              className="px-5 py-2.5 rounded-xl border border-[var(--card-border)] font-semibold text-sm hover:border-[var(--accent)]"
            >
              GitHub Deploy
            </Link>
            <Link
              href="/auth/signup"
              className="px-5 py-2.5 rounded-xl bg-[var(--accent)] text-[var(--background)] font-bold text-sm"
            >
              Connect Integrations
            </Link>
          </div>
        </main>
      </div>
    </>
  );
}
