'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Logo } from '@/components/layout/Logo';
import { HomepageChatBar } from '@/components/terminal/HomepageChatBar';
import { RotatingWords } from '@/components/ui/RotatingWords';
import { Sparkles, ArrowRight } from 'lucide-react';
import { GradientStartButton, PlayNowButton } from '@/components/ui/Uiverse';
import { DESKTOP_BG, MOBILE_BG } from '@/lib/theme';
import { useThemeStore } from '@/store/useThemeStore';
import { createClient } from '@/lib/supabase/client';
import { QUICK_ACTIONS } from '@/lib/quickActions';
import { cn } from '@/lib/utils';

const HOMEPAGE_ROTATE_WORDS = ['apps', 'games', 'websites', 'automations', 'movies', 'integrations'];

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
      <div className="fixed inset-0 -z-10 bg-gradient-to-b from-black/50 via-black/20 to-black/60" aria-hidden />

      <header className="xv-home-header sticky top-0 z-50 border-b border-white/[0.08] bg-transparent backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          <Logo href="/" variant="homepage" height={52} className="shrink-0" />
          <div className="flex items-center gap-2 shrink-0">
            {loggedIn ? (
              <Link
                href="/dashboard"
                className="xv-footer-pill flex items-center gap-1.5 text-xs sm:text-sm font-semibold"
              >
                Dashboard <ArrowRight className="w-3.5 h-3.5" />
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

      <main className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 py-10 sm:py-16 relative">
        <div className="absolute bottom-1/4 left-1/2 -translate-x-1/2 w-[80%] max-w-lg h-40 bg-[var(--accent)]/20 rounded-full blur-[100px] pointer-events-none" />

        <div className="relative z-10 w-full max-w-3xl text-center xv-mag-zone">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-white/15 bg-white/5 backdrop-blur-md text-[10px] sm:text-xs text-[var(--accent)] mb-5 font-terminal tracking-widest uppercase">
            <Sparkles className="w-3 h-3" />
            Next-Gen AGI · Live Now
          </div>

          <h1 className="text-3xl sm:text-5xl md:text-6xl font-bold mb-2 leading-[1.08] tracking-tight">
            <span className="block text-white drop-shadow-2xl xv-hero-line">Do Everything</span>
            <span className="block mt-1 bg-gradient-to-r from-white via-blue-200 to-[var(--accent)] bg-clip-text text-transparent xv-hero-gradient">
              You Imagine
            </span>
          </h1>

          <div className="flex justify-center mb-8 min-h-[3rem] xv-mag-zone">
            <RotatingWords
              prefix="Build"
              words={HOMEPAGE_ROTATE_WORDS}
              variant="hero"
              className="text-base sm:text-xl"
            />
          </div>

          <div className="w-full mb-8 xv-mag-zone">
            <HomepageChatBar />
          </div>

          <div className="flex flex-wrap justify-center gap-2 max-w-3xl mx-auto xv-mag-zone">
            {QUICK_ACTIONS.map((action) => {
              const Icon = action.icon;
              return (
                <button
                  key={action.id}
                  type="button"
                  onClick={() => router.push(loggedIn ? '/dashboard' : '/auth/signup')}
                  className={cn(
                    'xv-capsule-tag flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[11px] font-medium',
                    'border backdrop-blur-md transition-all duration-300 hover:-translate-y-0.5',
                    'hover:shadow-[0_0_20px_rgba(74,122,255,0.25)]'
                  )}
                  style={{
                    borderColor: `${action.color}55`,
                    background: `${action.color}18`,
                    color: 'rgba(255,255,255,0.95)',
                  }}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" style={{ color: action.color }} />
                  {action.label}
                </button>
              );
            })}
          </div>
        </div>
      </main>

      <footer className="relative z-10 py-6 flex flex-wrap items-center justify-center gap-2 sm:gap-3 px-4">
        <Link href="/about" className="xv-footer-pill">
          About Xroga
        </Link>
        <Link href="/pricing" className="xv-footer-pill">
          Pricing
        </Link>
        <Link href="/privacy" className="xv-footer-pill">
          Privacy Policy
        </Link>
        <Link href="/terms" className="xv-footer-pill">
          Terms of Service
        </Link>
        <Link href="/refund" className="xv-footer-pill">
          Refund Policy
        </Link>
      </footer>
    </div>
  );
}
