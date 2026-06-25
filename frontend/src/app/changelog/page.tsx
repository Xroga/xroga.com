import Link from 'next/link';
import { Sparkles } from 'lucide-react';

const ENTRIES = [
  {
    version: '1.0.0',
    date: '2025-06-25',
    title: 'Xroga Launch 🚀',
    items: [
      'Full dashboard with sidebar navigation and mobile support',
      '92 AI features powered by 5-agent Truth Council Swarm',
      'Galactic Tier pricing with regional support (USD, PKR, INR)',
      'Paddle subscription billing + Coinbase crypto top-ups',
      'GitHub integration with auto-repo creation',
      'Free trial: 50 Actions for 7 days',
      'Onboarding flow for new users',
      'Real-time notifications via SSE',
      'Hollywood Video Studio, Deep Research, Job Hunter, Code Debugger',
    ],
  },
  {
    version: '0.4.0',
    date: '2025-06-20',
    title: 'Phase 4: Dashboard UI',
    items: [
      'Project detail view with file previews',
      'Full settings page with security & notifications',
      'GitHub OAuth integration',
      'Notification bell with unread badges',
    ],
  },
  {
    version: '0.3.0',
    date: '2025-06-15',
    title: 'Phase 3: Premium Features',
    items: [
      'Video Studio with multi-provider support',
      'Deep Research with citations',
      'Content Blocker for family safety',
      'Job Hunter automation',
    ],
  },
];

export const metadata = {
  title: 'Changelog – Xroga',
  description: 'Latest features and improvements to Xroga.',
};

export default function ChangelogPage() {
  return (
    <div className="min-h-screen cosmic-bg">
      <header className="border-b border-[var(--card-border)] bg-black/20 backdrop-blur-sm">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-bold">
            <Sparkles className="w-5 h-5 text-violet-400" />
            Xroga
          </Link>
          <Link href="/pricing" className="text-sm text-violet-400 hover:underline">Pricing</Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-12">
        <h1 className="text-3xl font-bold mb-2">Changelog</h1>
        <p className="text-[var(--muted)] mb-10">New features, improvements, and fixes.</p>

        <div className="space-y-10">
          {ENTRIES.map((entry) => (
            <article key={entry.version} className="border-l-2 border-violet-500/50 pl-6">
              <div className="flex items-baseline gap-3 mb-2">
                <span className="text-xs font-mono text-violet-400">v{entry.version}</span>
                <time className="text-xs text-[var(--muted)]">{entry.date}</time>
              </div>
              <h2 className="text-xl font-semibold mb-3">{entry.title}</h2>
              <ul className="space-y-2">
                {entry.items.map((item) => (
                  <li key={item} className="text-sm text-[var(--muted)] flex items-start gap-2">
                    <span className="text-violet-400 mt-0.5">•</span>
                    {item}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </main>
    </div>
  );
}
