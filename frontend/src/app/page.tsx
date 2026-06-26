import Link from 'next/link';
import { Logo } from '@/components/layout/Logo';
import { GALACTIC_PLANS, FREE_TRIAL_ACTIONS } from '@/lib/plans';
import { Sparkles, Globe, Paperclip, Mic, ArrowRight } from 'lucide-react';

export default function HomePage() {
  return (
    <div className="min-h-screen cosmic-bg terminal-grid flex flex-col">
      <header className="sticky top-0 z-50 glass-panel-strong border-b border-[var(--card-border)]">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Logo href="/" size="md" />
          <div className="flex items-center gap-3">
            <button type="button" className="hidden sm:flex items-center gap-2 text-sm text-[var(--muted)] glass-panel px-3 py-1.5 rounded-lg">
              <Globe className="w-4 h-4" /> Theme
            </button>
            <Link
              href="/auth/signup"
              className="text-sm px-4 py-2 rounded-xl bg-white text-black font-semibold hover:opacity-90 flex items-center gap-2"
            >
              Get Started <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-6 py-12 relative">
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[120%] max-w-4xl h-64 bg-gradient-to-t from-[var(--primary)]/30 via-[var(--primary)]/10 to-transparent rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 w-full max-w-3xl text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full glass-panel text-xs text-[var(--accent)] mb-6 font-terminal tracking-wider">
            <Sparkles className="w-3 h-3" />
            NEXT-GEN AGI • LIVE NOW
          </div>

          <h1 className="text-4xl sm:text-6xl md:text-7xl font-bold mb-4 text-balance leading-tight">
            <span className="text-white">Do Everything</span>
            <br />
            <span className="gradient-text-blue">You Imagine</span>
          </h1>

          <p className="text-[var(--muted)] max-w-xl mx-auto mb-10 text-sm sm:text-base">
            XROGA AI — the world&apos;s most advanced intelligence. Create, build, explore, and bring your boldest ideas to life.
          </p>

          <div className="glass-panel-strong rounded-2xl p-2 mb-4 glow-blue">
            <div className="flex items-center gap-2 px-3 py-2 text-xs text-[var(--muted)] font-terminal border-b border-[var(--card-border)] mb-2">
              <span className="text-[var(--accent)]">⚡ {FREE_TRIAL_ACTIONS} free actions</span>
              <span className="mx-2">•</span>
              <span>Swarm online</span>
            </div>
            <div className="flex items-center gap-2">
              <input
                readOnly
                placeholder="Ask XROGA to do anything..."
                className="flex-1 bg-transparent px-4 py-3 text-sm font-terminal focus:outline-none placeholder:text-[var(--muted)]"
              />
              <div className="flex items-center gap-1 pr-2 text-[var(--muted)]">
                <Paperclip className="w-4 h-4" />
                <Mic className="w-4 h-4" />
              </div>
              <Link
                href="/auth/signup"
                className="px-5 py-3 rounded-xl bg-white text-black font-semibold text-sm flex items-center gap-2 hover:opacity-90 shrink-0"
              >
                Send <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>

          <Link
            href="/auth/signup"
            className="inline-flex items-center gap-2 glass-panel px-4 py-2 rounded-full text-sm text-[var(--accent)] hover:border-[var(--accent)]/40 mb-12"
          >
            Let&apos;s Build a Movie <ArrowRight className="w-4 h-4" />
          </Link>

          <div className="flex flex-wrap justify-center gap-2 max-w-2xl mx-auto">
            {[
              'Games 3D/2D',
              'Website • Apps',
              'Images & Videos',
              'Movies • Dramas',
              'Debug • Code Fix',
              'Web Search • Research',
              '3D Models',
              'Voice TTS • Cloning',
              'Android/iOS Games',
            ].map((tag) => (
              <span key={tag} className="glass-panel px-3 py-1.5 rounded-full text-xs text-[var(--muted)] hover:text-white hover:border-[var(--accent)]/30 transition-colors">
                {tag}
              </span>
            ))}
          </div>
        </div>
      </main>

      <section id="pricing" className="relative z-10 max-w-6xl mx-auto px-6 py-16 w-full">
        <h2 className="text-2xl font-bold text-center mb-8">Galactic Tiers</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {GALACTIC_PLANS.map((plan) => (
            <div key={plan.tier} className="glass-panel rounded-xl p-4 text-center">
              <h3 className="font-semibold">{plan.name}</h3>
              <p className="text-xl font-bold mt-1">{plan.priceLabel}</p>
              <p className="text-xs text-[var(--muted)]">{plan.actionsLabel}</p>
            </div>
          ))}
        </div>
        <div className="text-center mt-8">
          <Link href="/pricing" className="text-[var(--accent)] hover:underline text-sm">
            View full pricing & subscribe →
          </Link>
        </div>
      </section>

      <footer className="border-t border-[var(--card-border)] py-8 text-center text-sm text-[var(--muted)] glass-panel-strong">
        © {new Date().getFullYear()} Xroga — AI Swarm Operating System
      </footer>
    </div>
  );
}
