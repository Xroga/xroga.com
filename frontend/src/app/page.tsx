'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Logo } from '@/components/layout/Logo';
import { GALACTIC_PLANS } from '@/lib/plans';
import { HomepageChatBar } from '@/components/terminal/HomepageChatBar';
import { Sparkles } from 'lucide-react';
import { StaticQuickTab, GradientStartButton, PlayNowButton } from '@/components/ui/Uiverse';

const HOMEPAGE_TAGS = [
  'Games 3D/2D',
  'Website · Apps',
  'Images & Videos',
  'Movies · Dramas',
  'Debug · Code Fix',
  'Web Search · Research',
  '3D Models',
  'Voice TTS · Cloning',
  'Android/iOS Games',
];

export default function HomePage() {
  const router = useRouter();

  return (
    <div className="min-h-screen cosmic-bg terminal-grid flex flex-col">
      <header className="sticky top-0 z-50 bg-transparent border-b border-transparent">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Logo href="/" variant="header" height={56} />
          <div className="flex items-center gap-3">
            <PlayNowButton onClick={() => router.push('/auth/login')}>Sign In</PlayNowButton>
            <GradientStartButton onClick={() => router.push('/auth/signup')}>Get Started</GradientStartButton>
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
            <span className="text-[var(--foreground)]">Do Everything</span>
            <br />
            <span className="gradient-text-blue">You Imagine</span>
          </h1>

          <p className="text-[var(--muted)] max-w-xl mx-auto mb-10 text-sm sm:text-base">
            XROGA AI — the world&apos;s most advanced intelligence. Create, build, explore, and bring your boldest ideas to life.
          </p>

          <HomepageChatBar />

          <div className="flex flex-wrap justify-center gap-2 max-w-3xl mx-auto mt-8">
            {HOMEPAGE_TAGS.map((tag) => (
              <StaticQuickTab key={tag} onClick={() => router.push('/auth/signup')}>
                {tag}
              </StaticQuickTab>
            ))}
          </div>
        </div>
      </main>

      <section id="pricing" className="relative z-10 max-w-6xl mx-auto px-6 py-16 w-full">
        <h2 className="text-2xl font-bold text-center mb-8">Galactic Tiers</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {GALACTIC_PLANS.map((plan) => (
            <div key={plan.tier} className="glass-panel rounded-xl p-4 text-center universe-float">
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
