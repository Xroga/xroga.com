import Link from 'next/link';
import { buildMetadata } from '@/lib/seo';

export const metadata = buildMetadata({
  title: 'Xroga AI Platform — Build Anything Without Code',
  description:
    'Xroga AI is the world\'s most powerful AI development platform. Websites, SaaS, AI apps, mobile PWAs — built automatically for non-technical and technical users.',
  path: '/docs/platform',
});

const USER_TYPES = [
  { type: 'Non-Technical', experience: 'Describe → Deploy → Live', xroga: 'Everything automatically' },
  { type: 'Technical', experience: 'Describe → Connect integrations → Advanced features', xroga: 'Automatic + flexibility' },
  { type: 'Developer', experience: 'Describe → APIs → API keys → Custom apps', xroga: 'Automatic + full control' },
];

const MODELS = [
  { name: 'DeepSeek Flash', role: 'Workhorse', usage: '80%', tasks: 'Bulk code, file reading, docs, tests' },
  { name: 'DeepSeek Pro', role: 'Brain', usage: '15%', tasks: 'Architecture, security, DB design' },
  { name: 'Grok', role: 'Strategist', usage: '5%', tasks: 'Business logic, chain-of-thought, diagnosis' },
  { name: 'Claude Sonnet', role: 'Designer', usage: '5%', tasks: 'UI/UX, Tailwind, responsive design' },
  { name: 'Claude Opus', role: 'Quality Gate', usage: '<1%', tasks: 'Final review, edge cases, security' },
];

export default function PlatformDocsPage() {
  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <header className="sticky top-0 z-50 glass-panel-strong border-b border-[var(--card-border)]">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="text-sm font-bold text-[var(--accent)]">
            ← XROGA AI
          </Link>
          <Link href="/pricing" className="text-sm text-[var(--muted)] hover:text-[var(--foreground)]">
            Pricing
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10 space-y-12">
        <section>
          <h1 className="text-3xl font-bold mb-4">Xroga AI Platform</h1>
          <p className="text-lg text-[var(--muted)] leading-relaxed">
            Xroga AI is the world&apos;s most powerful AI-powered development platform. Anyone can build anything — without writing a single line of code. The same AI builds for everyone; technical users get more control and custom integrations.
          </p>
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

        <section className="glass-panel rounded-2xl p-6">
          <h2 className="text-xl font-bold mb-4">What Xroga builds</h2>
          <ul className="grid sm:grid-cols-2 gap-3 text-sm text-[var(--muted)]">
            {[
              'Websites — landing, e-commerce, blogs, portfolios',
              'Full-stack apps — SaaS, CRM, dashboards, help desks',
              'AI apps — chatbots, content generators, tutors, automation',
              'Mobile-ready PWAs — social, fitness, delivery, chat',
              'Software tools — invoicing, expense tracking, API testers',
              'Automation — browser scraping, workflows, email sequences',
            ].map((item) => (
              <li key={item} className="flex gap-2">
                <span className="text-[var(--accent)]">✓</span>
                {item}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm font-semibold text-[var(--accent)]">
            Can Xroga build this? YES. Always YES.
          </p>
        </section>

        <section className="glass-panel rounded-2xl p-6">
          <h2 className="text-xl font-bold mb-4">Automatic integrations</h2>
          <p className="text-sm text-[var(--muted)] mb-4">
            Click Connect → Authorize. Xroga creates projects, generates keys, configures schemas, and injects environment variables at deploy time. Users never copy API keys into code.
          </p>
          <div className="grid sm:grid-cols-2 gap-2 text-sm">
            {['Supabase', 'Vercel', 'Netlify', 'Cloudflare', 'Cloudflare R2', 'Paddle', 'Brevo', 'GitHub'].map(
              (name) => (
                <div key={name} className="px-3 py-2 rounded-lg border border-[var(--card-border)] bg-[var(--foreground)]/[0.03]">
                  <span className="font-medium">{name}</span>
                  <span className="ml-2 text-[10px] text-[var(--accent)]">Auto</span>
                </div>
              )
            )}
          </div>
        </section>

        <section className="glass-panel rounded-2xl p-6">
          <h2 className="text-xl font-bold mb-4">AI model collaboration</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--card-border)] text-left">
                  <th className="py-2 pr-3">Model</th>
                  <th className="py-2 pr-3">Role</th>
                  <th className="py-2 pr-3">Usage</th>
                  <th className="py-2">Tasks</th>
                </tr>
              </thead>
              <tbody>
                {MODELS.map((m) => (
                  <tr key={m.name} className="border-b border-[var(--card-border)]/50">
                    <td className="py-2.5 pr-3 font-medium">{m.name}</td>
                    <td className="py-2.5 pr-3">{m.role}</td>
                    <td className="py-2.5 pr-3 text-[var(--accent)]">{m.usage}</td>
                    <td className="py-2.5 text-[var(--muted)]">{m.tasks}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="glass-panel rounded-2xl p-6">
          <h2 className="text-xl font-bold mb-4">Build process</h2>
          <ol className="space-y-2 text-sm text-[var(--muted)] list-decimal list-inside">
            <li>Understanding &amp; planning (DeepSeek Pro + Grok)</li>
            <li>GitHub connection &amp; repository analysis</li>
            <li>Architecture design &amp; code generation</li>
            <li>Integration wiring (Supabase, Paddle, Cloudflare)</li>
            <li>Error detection &amp; multi-model review</li>
            <li>Auto-deploy to Vercel + CDN</li>
            <li>Live preview, GitHub code access, documentation</li>
          </ol>
        </section>

        <section className="glass-panel rounded-2xl p-6">
          <h2 className="text-xl font-bold mb-4">After build — your dashboard</h2>
          <ul className="space-y-2 text-sm text-[var(--muted)]">
            <li>Live preview of your site or app in an iframe</li>
            <li>Live deployment URL (Vercel + Cloudflare SSL)</li>
            <li>View all code on GitHub — full ownership</li>
            <li>Project summary, instructions, and next steps</li>
            <li>Add features by telling Xroga what to change</li>
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
