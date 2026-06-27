'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Logo } from '@/components/layout/Logo';
import { HomepageChatBar } from '@/components/terminal/HomepageChatBar';
import { HomepageTagMarquee } from '@/components/homepage/HomepageTagMarquee';
import { RotatingWords } from '@/components/ui/RotatingWords';
import { Sparkles, ArrowRight, Zap } from 'lucide-react';
import { GradientStartButton, PlayNowButton } from '@/components/ui/Uiverse';
import { DESKTOP_BG, MOBILE_BG } from '@/lib/theme';
import { XROGA_MODEL_FULL, XROGA_MODEL_TAGLINE } from '@/lib/brand';
import { useThemeStore } from '@/store/useThemeStore';
import { createClient } from '@/lib/supabase/client';

const HOMEPAGE_ROTATE_WORDS = ['apps', 'games', 'websites', 'automations', 'movies', 'AI agents'];

export default function HomePage() {
  const router = useRouter();
  const customDesktopBg = useThemeStore((s) => s.customDesktopBg);
  const customMobileBg = useThemeStore((s) => s.customMobileBg);
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    createClient()
      .auth.getSession()
      .then(({ data: { session } }) => setLoggedIn(!!session));
  }, []);

  return (
    <div className="xv-homepage min-h-screen flex flex-col relative overflow-x-hidden xv-mag-cursor">
      <div
        className="fixed inset-0 -z-10 bg-cover bg-center bg-no-repeat md:bg-fixed"
        style={{ backgroundImage: `url("${customDesktopBg ?? DESKTOP_BG}")` }}
        aria-hidden
      />
      <div
        className="fixed inset-0 -z-10 bg-cover bg-center bg-no-repeat md:hidden"
        style={{ backgroundImage: `url("${customMobileBg ?? MOBILE_BG}")` }}
        aria-hidden
      />
      <div className="fixed inset-0 -z-10 bg-gradient-to-b from-black/55 via-black/25 to-black/65" aria-hidden />

      <header className="xv-home-header sticky top-0 z-50 bg-transparent border-none shadow-none">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-3">
          <Logo href="/" variant="homepage" height={76} className="shrink-0" />
          <div className="flex items-center gap-2 shrink-0">
            {loggedIn ? (
              <Link href="/dashboard" className="xv-dashboard-cta flex items-center gap-2 text-xs sm:text-sm font-semibold">
                <span>Dashboard</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            ) : (
              <>
                <PlayNowButton className="xv-play-btn-sm" onClick={() => router.push('/auth/login')}>
                  Sign In
                </PlayNowButton>
                <GradientStartButton className="xv-gradient-btn-sm" onClick={() => router.push('/auth/signup')}>
                  Get Started
                </GradientStartButton>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 py-8 sm:py-14 relative">
        <div className="absolute bottom-1/4 left-1/2 -translate-x-1/2 w-[80%] max-w-lg h-40 bg-[var(--accent)]/25 rounded-full blur-[120px] pointer-events-none" />

        <div className="relative z-10 w-full max-w-4xl text-center xv-mag-zone">
          <div className="xv-hero-badge inline-flex items-center gap-2 px-4 py-2 rounded-full mb-6">
            <Sparkles className="w-3.5 h-3.5 text-[var(--accent)]" />
            <span className="text-[10px] sm:text-xs tracking-[0.2em] uppercase font-semibold text-white/90">
              {XROGA_MODEL_FULL} · Live
            </span>
            <Zap className="w-3 h-3 text-[var(--accent)]" />
          </div>

          <h1 className="xv-hero-title text-4xl sm:text-5xl md:text-7xl font-bold mb-4 leading-[1.05] tracking-tight">
            <span className="block text-white xv-hero-shine">Do Everything</span>
            <span className="block mt-2 xv-hero-gradient-text">You Imagine</span>
          </h1>

          <div className="xv-hero-underline mx-auto mb-5" aria-hidden />

          <p className="text-sm sm:text-lg text-white/80 max-w-2xl mx-auto mb-3 leading-relaxed xv-hero-sub font-medium">
            One AI model that does it all — apps, games, movies, code, and automations.
            <span className="block text-white/60 text-xs sm:text-sm mt-1 font-normal">{XROGA_MODEL_TAGLINE}</span>
          </p>

          <div className="flex justify-center mb-6 min-h-[2.5rem]">
            <RotatingWords
              prefix="Build"
              words={HOMEPAGE_ROTATE_WORDS}
              variant="hero"
              className="text-lg sm:text-2xl xv-hero-rotate"
              stopAfterMs={24000}
            />
          </div>

          <div className="w-full mb-10">
            <HomepageChatBar />
          </div>

          <HomepageTagMarquee />
        </div>
      </main>

      <footer className="relative z-10 py-6 flex flex-wrap items-center justify-center gap-2 sm:gap-3 px-4">
        <Link href="/about" className="xv-footer-pill">About Xroga</Link>
        <Link href="/docs/api" className="xv-footer-pill">API</Link>
        <Link href="/pricing" className="xv-footer-pill">Pricing</Link>
        <Link href="/privacy" className="xv-footer-pill">Privacy Policy</Link>
        <Link href="/terms" className="xv-footer-pill">Terms of Service</Link>
        <Link href="/refund" className="xv-footer-pill">Refund Policy</Link>
      </footer>
    </div>
  );
}
