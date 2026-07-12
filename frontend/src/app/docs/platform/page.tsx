import Link from 'next/link';
import { buildMetadata } from '@/lib/seo';
import {
  PLATFORM_PARTS,
  MODEL_TABLE,
  BUILD_STEPS,
  NO_HESITATE,
} from '@/lib/platformDocsContent';

export const metadata = buildMetadata({
  title: 'Xroga AI Platform — Build Anything Without Code',
  description:
    'Complete Xroga AI platform specification: websites, SaaS, AI apps, integrations, security, deployment, and multi-model AI collaboration.',
  path: '/docs/platform',
});

const USER_TYPES = [
  { type: 'Non-Technical', experience: 'Describe → Connect → Live app', xroga: 'Everything automatically' },
  { type: 'Technical', experience: 'Describe → Connect integrations → Advanced features', xroga: 'Automatic + flexibility' },
  { type: 'Developer', experience: 'Describe → APIs → API keys → Custom apps', xroga: 'Automatic + full control' },
];

export default function PlatformDocsPage() {
  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <header className="sticky top-0 z-50 glass-panel-strong border-b border-[var(--card-border)]">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="text-sm font-bold text-[var(--accent)]">
            ← XROGA AI
          </Link>
          <nav className="flex gap-4 text-xs text-[var(--muted)]">
            {PLATFORM_PARTS.slice(0, 4).map((p) => (
              <a key={p.id} href={`#${p.id}`} className="hover:text-[var(--foreground)] hidden sm:inline">
                {p.id.replace('part-', 'P')}
              </a>
            ))}
            <Link href="/pricing" className="hover:text-[var(--foreground)]">
              Pricing
            </Link>
          </nav>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10 space-y-10">
        <section>
          <h1 className="text-3xl font-bold mb-4">Xroga AI Platform</h1>
          <p className="text-lg text-[var(--muted)] leading-relaxed">
            Xroga AI is the world&apos;s most powerful AI-powered development platform. Anyone can build anything — without writing a single line of code. The same AI builds for everyone; technical users get more control and custom integrations.
          </p>
          <p className="mt-3 text-sm font-semibold text-[var(--accent)]">Can Xroga build this? YES. Always YES.</p>
        </section>

        <section className="glass-panel rounded-2xl p-6">
          <h2 className="text-xl font-bold mb-4">Who it&apos;s for</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--card-border)] text-left">
                  <th className="py-2 pr-4 font-semibold">User type</th>
                  <th className="py-2 pr-4 font-semibold">Experience</th>
                  <th className="py-2 font-semibold">Xroga AI</th>
                </tr>
              </thead>
              <tbody>
                {USER_TYPES.map((row) => (
                  <tr key={row.type} className="border-b border-[var(--card-border)]/50">
                    <td className="py-3 pr-4 font-medium">{row.type}</td>
                    <td className="py-3 pr-4 text-[var(--muted)]">{row.experience}</td>
                    <td className="py-3">{row.xroga}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {PLATFORM_PARTS.map((part) => (
          <section key={part.id} id={part.id} className="glass-panel rounded-2xl p-6 scroll-mt-20">
            <h2 className="text-xl font-bold mb-4">{part.title}</h2>
            <div className="space-y-5">
              {part.sections.map((sec) => (
                <div key={sec.heading}>
                  <h3 className="text-sm font-semibold mb-2">{sec.heading}</h3>
                  <ul className="space-y-1.5 text-sm text-[var(--muted)]">
                    {sec.items.map((item) => (
                      <li key={item} className="flex gap-2">
                        <span className="text-[var(--accent)] shrink-0">✓</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                  {sec.stack && (
                    <p className="mt-2 text-xs text-[var(--accent)] font-mono">{sec.stack}</p>
                  )}
                </div>
              ))}
            </div>
          </section>
        ))}

        <section className="glass-panel rounded-2xl p-6">
          <h2 className="text-xl font-bold mb-4">AI model collaboration</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--card-border)] text-left">
                  <th className="py-2 pr-2">Model</th>
                  <th className="py-2 pr-2">Role</th>
                  <th className="py-2 pr-2">Share</th>
                  <th className="py-2 pr-2">7M pool</th>
                  <th className="py-2 pr-2">Tasks</th>
                  <th className="py-2">API cost</th>
                </tr>
              </thead>
              <tbody>
                {MODEL_TABLE.map((m) => (
                  <tr key={m.name} className="border-b border-[var(--card-border)]/50">
                    <td className="py-2.5 pr-2 font-medium">{m.name}</td>
                    <td className="py-2.5 pr-2">{m.role}</td>
                    <td className="py-2.5 pr-2 text-[var(--accent)]">{m.usage}</td>
                    <td className="py-2.5 pr-2 font-mono text-xs">{m.tokens7M}</td>
                    <td className="py-2.5 pr-2 text-[var(--muted)]">{m.tasks}</td>
                    <td className="py-2.5 text-[var(--muted)] text-xs">{m.cost}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="glass-panel rounded-2xl p-6">
          <h2 className="text-xl font-bold mb-4">Building process (step by step)</h2>
          <ol className="space-y-2 text-sm text-[var(--muted)] list-decimal list-inside">
            {BUILD_STEPS.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </section>

        <section className="glass-panel rounded-2xl p-6">
          <h2 className="text-xl font-bold mb-4">NO HESITATE rule</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--card-border)] text-left">
                  <th className="py-2 pr-4">User asks</th>
                  <th className="py-2">Xroga says</th>
                </tr>
              </thead>
              <tbody>
                {NO_HESITATE.map((row) => (
                  <tr key={row.ask} className="border-b border-[var(--card-border)]/50">
                    <td className="py-2.5 pr-4 text-[var(--muted)]">{row.ask}</td>
                    <td className="py-2.5 font-medium text-emerald-600 dark:text-emerald-400">{row.answer}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="glass-panel rounded-2xl p-6">
          <h2 className="text-xl font-bold mb-4">GitHub pre-build analysis</h2>
          <p className="text-sm text-[var(--muted)] mb-3">
            Before generating code, Xroga connects to GitHub, scans the full repository tree, detects tech stack (Next.js, Supabase, Tailwind), and reads critical files — then builds with full context.
          </p>
          <ul className="text-sm text-[var(--muted)] space-y-1 list-disc list-inside">
            <li>No repo → fresh project scaffold</li>
            <li>Existing repo → tiered file read + integration detection</li>
            <li>Not connected → prompt to connect GitHub first</li>
          </ul>
        </section>

        <section className="text-center py-6">
          <Link
            href="/auth/signup"
            className="inline-flex px-6 py-3 rounded-full bg-[var(--accent)] text-[var(--background)] font-bold text-sm hover:opacity-90"
          >
            Start building free
          </Link>
        </section>
      </main>
    </div>
  );
}
