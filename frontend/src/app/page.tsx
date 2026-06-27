'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Logo } from '@/components/layout/Logo';
import { HomepageChatBar } from '@/components/terminal/HomepageChatBar';
import { HomepageTagMarquee } from '@/components/homepage/HomepageTagMarquee';
import { ModelBadge } from '@/components/ui/ModelBadge';
import { Sparkles, Zap } from 'lucide-react';
import { GradientStartButton, PlayNowButton } from '@/components/ui/Uiverse';
import { DESKTOP_BG, MOBILE_BG } from '@/lib/theme';
import { XROGA_MODEL_TAGLINE, XROGA_MODEL_TAGLINE_HUMBLE, XROGA_AI_GENIUS } from '@/lib/brand';
import { useThemeStore } from '@/store/useThemeStore';
import { createClient } from '@/lib/supabase/client';

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
    <div className="xv-homepage min-h-screen flex flex-col relative overflow-x-hidden">
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
              <Link
                href="/dashboard"
                className="group relative px-5 sm:px-8 py-2.5 sm:py-3.5 font-bold text-white uppercase tracking-wider rounded-2xl bg-[#006aff] border-b-[6px] sm:border-b-[8px] border-[#0047b3] active:border-b-0 active:translate-y-[6px] sm:active:translate-y-[8px] transition-all duration-100 shadow-[0_15px_25px_-10px_rgba(0,106,255,0.75)] focus:outline-none focus:ring-4 focus:ring-blue-400/50 text-xs sm:text-sm"
              >
                <span className="absolute inset-0 w-full h-full rounded-2xl bg-gradient-to-t from-black/20 to-transparent pointer-events-none" />
                <span className="absolute top-1.5 sm:top-2 left-2 sm:left-3 w-5 sm:w-6 h-2.5 sm:h-3 rounded-full bg-white/40 blur-[2px] pointer-events-none" />
                <span className="relative flex items-center justify-center gap-2 drop-shadow-md">
                  <svg
                    className="w-4 h-4 sm:w-5 sm:h-5 animate-pulse"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                    aria-hidden
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M13 10V3L4 14h7v7l9-11h-7z"
                    />
                  </svg>
                  Dashboard
                </span>
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

        <div className="relative z-10 w-full max-w-4xl text-center">
          <div className="xv-hero-badge inline-flex flex-col items-center gap-1 px-5 py-3 rounded-2xl mb-6">
            <div className="flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-[var(--accent)]" />
              <span className="text-[10px] sm:text-xs tracking-[0.15em] uppercase font-semibold text-white/80">
                {XROGA_AI_GENIUS}
              </span>
              <Zap className="w-3 h-3 text-[var(--accent)]" />
            </div>
            <ModelBadge variant="hero" showSubtext />
            <span className="text-[9px] text-emerald-400/90 font-semibold tracking-widest uppercase mt-0.5">
              · Live ·
            </span>
          </div>

          <h1 className="xv-hero-title text-4xl sm:text-5xl md:text-7xl font-bold mb-4 leading-[1.05] tracking-tight">
            <span className="block text-white xv-hero-shine">Do Everything</span>
            <span className="block mt-1 sm:mt-2 xv-hero-gradient-text">You Imagine</span>
          </h1>

          <div className="xv-hero-underline mx-auto mb-6" aria-hidden />

          <p className="text-base sm:text-xl text-white/90 max-w-2xl mx-auto mb-2 leading-relaxed xv-hero-sub font-semibold tracking-tight">
            One AI model that does it all — apps, games, movies, code, and automations.
          </p>
          <p className="text-xs sm:text-sm text-white/55 max-w-xl mx-auto mb-1 font-medium">
            {XROGA_MODEL_TAGLINE}
          </p>
          <p className="text-[10px] sm:text-xs text-white/40 max-w-lg mx-auto mb-8 leading-relaxed italic px-2">
            {XROGA_MODEL_TAGLINE_HUMBLE}
          </p>

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
