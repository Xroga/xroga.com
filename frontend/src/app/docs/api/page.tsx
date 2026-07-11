import Link from 'next/link';
import { buildMetadata } from '@/lib/seo';
import {
  XROGA_MODEL_FULL,
  XROGA_MODEL_ID,
  XROGA_API_BASE,
  XROGA_MODEL_TAGLINE,
} from '@/lib/brand';
import { FEATURE_COUNT } from '@/lib/features';
import { ArrowLeft, Key, Zap, BookOpen, Code2 } from 'lucide-react';

export const metadata = buildMetadata({
  title: 'API Documentation',
  description: `${XROGA_MODEL_FULL} API — one model, high limits, every feature on all plans. ${XROGA_MODEL_TAGLINE}`,
  path: '/docs/api',
});

export default function ApiDocsPage() {
  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 space-y-10">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-[var(--muted)] hover:text-[var(--foreground)]">
          <ArrowLeft className="w-4 h-4" /> Back to Xroga
        </Link>

        <header className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-[var(--accent)]">{XROGA_MODEL_FULL}</p>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">XROGA API</h1>
          <p className="text-[var(--muted)] leading-relaxed">
            One evolving model — <strong className="text-[var(--foreground)]">{XROGA_MODEL_ID}</strong>.
            New capabilities ship inside {XROGA_MODEL_FULL}, not as separate models.
            All {FEATURE_COUNT} features and swarm agents available on every plan with generous rate limits.
          </p>
          <p className="text-xs text-[var(--muted)] italic border-l-2 border-[var(--accent)]/30 pl-3">
            {XROGA_MODEL_TAGLINE} Hover the ∞ symbol in-app for our philosophy on version infinity.
          </p>
        </header>

        <section className="xv-billing-card rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Key className="w-5 h-5 text-[var(--accent)]" />
            <h2 className="font-bold text-lg">Authentication</h2>
          </div>
          <p className="text-sm text-[var(--muted)]">
            Use your session JWT from the dashboard, or create an API key in Settings → API (coming soon).
          </p>
          <pre className="text-xs p-4 rounded-xl bg-black/5 dark:bg-white/5 overflow-x-auto border border-[var(--card-border)]">
{`Authorization: Bearer <your_token>
Content-Type: application/json`}
          </pre>
        </section>

        <section className="xv-billing-card rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-[var(--accent)]" />
            <h2 className="font-bold text-lg">Swarm execute</h2>
          </div>
          <p className="text-sm text-[var(--muted)]">Run the full multi-agent swarm on any prompt. 1 action per chat turn; builds scale by complexity.</p>
          <p className="text-xs font-mono text-[var(--accent)]">POST {XROGA_API_BASE}/swarm/execute</p>
          <pre className="text-xs p-4 rounded-xl bg-black/5 dark:bg-white/5 overflow-x-auto border border-[var(--card-border)]">
{`{
  "prompt": "Build a landing page for my SaaS",
  "model": "${XROGA_MODEL_ID}",
  "project_id": "optional-uuid"
}`}
          </pre>
        </section>

        <section className="xv-billing-card rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Code2 className="w-5 h-5 text-[var(--accent)]" />
            <h2 className="font-bold text-lg">Rate limits</h2>
          </div>
          <ul className="text-sm text-[var(--muted)] space-y-2 list-disc pl-5">
            <li>Spark: 7M tokens/mo · 2 concurrent swarms</li>
            <li>Pulse: 12M tokens/mo · 8 concurrent</li>
            <li>Nova+: 20M+ tokens/mo · higher concurrency</li>
            <li>API requests share your plan token quota — no feature gating</li>
          </ul>
        </section>

        <section className="xv-billing-card rounded-2xl p-6 space-y-3">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-[var(--accent)]" />
            <h2 className="font-bold text-lg">Helpful docs</h2>
          </div>
          <ul className="text-sm space-y-2">
            <li><Link href="/pricing" className="text-[var(--accent)] hover:underline">Plans & token quota</Link></li>
            <li><Link href="/terms" className="text-[var(--accent)] hover:underline">Terms of Service</Link></li>
            <li><Link href="/about" className="text-[var(--accent)] hover:underline">About Xroga & the team</Link></li>
            <li><a href="mailto:hello@xroga.com" className="text-[var(--accent)] hover:underline">hello@xroga.com</a> — API & support</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
