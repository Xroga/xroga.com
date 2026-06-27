import type { Metadata } from 'next';
import Link from 'next/link';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: 'Privacy Policy',
  description: 'Xroga AI privacy policy — how we handle your data, safe browsing, and zero adult content policy.',
  path: '/privacy',
});

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <header className="border-b border-[var(--card-border)] glass-panel-strong">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="text-sm text-[var(--accent)] hover:underline">
            ← Xroga AI
          </Link>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-6 py-12 prose prose-invert max-w-none space-y-6 text-sm leading-relaxed">
        <h1 className="text-3xl font-bold">Privacy Policy</h1>
        <p className="text-[var(--muted)]">Last updated: {new Date().toLocaleDateString()}</p>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Your data</h2>
          <p>
            Xroga AI stores account data via Supabase (email, profile). Swarm prompts and project files are used to
            fulfill your requests. We do not sell personal data.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Safe browsing</h2>
          <p>
            Xroga Browser enforces SafeSearch, URL blocklists, and adult content bans. VPN/proxy detection and AI
            moderation layers are being expanded. Adult content is not permitted on Xroga AI — period.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Contact</h2>
          <p>
            Founder: Muhammad Ibrahim · Pakistan ·{' '}
            <Link href="/about" className="text-[var(--accent)]">
              About Xroga
            </Link>
          </p>
        </section>
      </main>
    </div>
  );
}
