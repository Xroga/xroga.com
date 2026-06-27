'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Logo } from '@/components/layout/Logo';
import { HomepageChatBar } from '@/components/terminal/HomepageChatBar';
import { TypewriterText } from '@/components/ui/TypewriterText';
import { Sparkles, ArrowRight } from 'lucide-react';
import { GradientStartButton, PlayNowButton } from '@/components/ui/Uiverse';
import { DESKTOP_BG, MOBILE_BG } from '@/lib/theme';
import { useThemeStore } from '@/store/useThemeStore';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

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
          <Logo href="/" variant="homepage" height={40} className="shrink-0" />
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

          <p className="text-white/80 max-w-md mx-auto mb-8 text-sm sm:text-base leading-relaxed min-h-[3.5rem] xv-mag-zone">
            <TypewriterText
              text="XROGA AI — build, automate, and create with a multi-agent swarm. Websites, apps, games, and browser research in one place."
              speed={22}
              delay={400}
            />
          </p>

          <div className="w-full mb-8 xv-mag-zone">
            <HomepageChatBar />
          </div>

          <div className="flex flex-wrap justify-center gap-2 max-w-2xl mx-auto xv-mag-zone">
            {HOMEPAGE_TAGS.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => router.push(loggedIn ? '/dashboard' : '/auth/signup')}
                className={cn(
                  'xv-capsule-tag px-3.5 py-2 rounded-full text-[11px] font-medium',
                  'border border-white/20 bg-white/5 backdrop-blur-md text-white/90',
                  'hover:bg-white/15 hover:border-[var(--accent)]/50 hover:shadow-[0_0_20px_rgba(74,122,255,0.25)]',
                  'transition-all duration-300 hover:-translate-y-0.5'
                )}
              >
                {tag}
              </button>
            ))}
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
      </footer>
    </div>
  );
}
