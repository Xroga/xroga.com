'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Logo } from '@/components/layout/Logo';
import { HomepageChatBar } from '@/components/terminal/HomepageChatBar';
import { HomepageTagMarquee } from '@/components/homepage/HomepageTagMarquee';
import { AppStoreInline } from '@/components/ui/AppStoreInline';
import { PowerSmashButton, DottedSignInButton } from '@/components/ui/XrogaButtons';
import { DESKTOP_BG, MOBILE_BG } from '@/lib/theme';
import { XROGA_MODEL_TAGLINE, XROGA_MODEL_FIRST_LAST } from '@/lib/brand';
import { useThemeStore } from '@/store/useThemeStore';
import { createClient } from '@/lib/supabase/client';
import { Sparkles } from 'lucide-react';

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
      <div className="fixed inset-0 -z-10 xv-hero-axrina-bg" aria-hidden />

      <header className="xv-home-header sticky top-0 z-50 bg-transparent border-none shadow-none">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-3">
          <Logo href="/" variant="homepage" height={76} className="shrink-0" />
          <div className="flex items-center gap-3">
            <AppStoreInline compact className="hidden sm:inline-flex" />
            {loggedIn && (
              <PowerSmashButton size="md" onClick={() => router.push('/dashboard')}>
                Dashboard
              </PowerSmashButton>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 py-8 sm:py-14 relative">
        <div className="absolute bottom-1/4 left-1/2 -translate-x-1/2 w-[80%] max-w-lg h-40 bg-[#6b21a8]/25 rounded-full blur-[120px] pointer-events-none" />

        <div className="relative z-10 w-full max-w-5xl text-center">
          {/* Axrina-style badge */}
          <div className="xv-hero-axrina-badge inline-flex items-stretch mb-8 overflow-hidden rounded-full">
            <span className="xv-hero-axrina-badge__new">New</span>
            <span className="xv-hero-axrina-badge__text">Black Hole V∞ is out now</span>
          </div>

          <h1 className="xv-hero-axrina-title mb-5">
            Meet{' '}
            <span className="xv-hero-axrina-brand">
              Xroga
              <span className="xv-hero-axrina-underline" aria-hidden />
            </span>
            <br className="sm:hidden" />
            {' '}Personal AI Assistant
            <span className="xv-hero-axrina-sparkles inline-flex ml-2 align-middle" aria-hidden>
              <Sparkles className="w-5 h-5 sm:w-7 sm:h-7 text-[#e8c4a8]/80" />
            </span>
          </h1>

          <p className="xv-hero-axrina-sub max-w-xl mx-auto mb-6 text-sm sm:text-base leading-relaxed">
            One AI model that does it all — apps, games, movies, code, and automations.{' '}
            <span className="block mt-1 text-[#93c5fd] font-semibold text-xs sm:text-sm">{XROGA_MODEL_TAGLINE}</span>
            <span className="block mt-0.5 text-white/50 text-[10px] sm:text-xs">{XROGA_MODEL_FIRST_LAST}</span>
          </p>

          {!loggedIn && (
            <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4 mb-8">
              <PowerSmashButton
                size="sm"
                onClick={() => router.push('/auth/signup')}
                className="xv-get-started-outline"
              >
                Get Started
              </PowerSmashButton>
              <DottedSignInButton onClick={() => router.push('/auth/login')}>Sign In</DottedSignInButton>
            </div>
          )}

          <div className="w-full mb-6">
            <HomepageChatBar />
          </div>

          <div className="w-full mb-4">
            <AppStoreInline className="mb-5" />
            <HomepageTagMarquee />
          </div>
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
