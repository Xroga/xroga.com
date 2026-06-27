'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Logo } from '@/components/layout/Logo';
import { HomepageChatBar } from '@/components/terminal/HomepageChatBar';
import { HomepageTagMarquee } from '@/components/homepage/HomepageTagMarquee';
import { ModelBadge } from '@/components/ui/ModelBadge';
import { PowerSmashButton, DottedSignInButton } from '@/components/ui/XrogaButtons';
import { DESKTOP_BG, MOBILE_BG } from '@/lib/theme';
import { XROGA_MODEL_TAGLINE, XROGA_MODEL_FIRST_LAST } from '@/lib/brand';
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
          {loggedIn && (
            <PowerSmashButton size="md" onClick={() => router.push('/dashboard')}>
              Dashboard
            </PowerSmashButton>
          )}
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 py-8 sm:py-14 relative">
        <div className="absolute bottom-1/4 left-1/2 -translate-x-1/2 w-[80%] max-w-lg h-40 bg-[#006aff]/20 rounded-full blur-[120px] pointer-events-none" />

        <div className="relative z-10 w-full max-w-5xl text-center">
          <div className="xv-hero-model-pill inline-flex items-center justify-center mb-8 px-6 py-3 rounded-full">
            <ModelBadge variant="hero" showSubtext />
            <span className="ml-3 text-[9px] text-emerald-400/90 font-semibold tracking-widest uppercase">· Live ·</span>
          </div>

          <h1 className="xv-hero-modern-title mb-6">
            <span className="xv-hero-modern-line block">
              <span className="xv-hero-silver">Do </span>
              <span className="xv-hero-silver-italic">Everything</span>
            </span>
            <span className="xv-hero-modern-line block mt-1 sm:mt-2">
              <span className="xv-hero-blue">You </span>
              <span className="xv-hero-blue-italic">Imagine</span>
            </span>
          </h1>

          <div className="xv-hero-sub-card mx-auto max-w-3xl mb-8 px-5 sm:px-8 py-4 sm:py-5 rounded-2xl">
            <p className="text-sm sm:text-lg text-slate-800/95 font-semibold leading-relaxed tracking-tight">
              One AI model that does it all — apps, games, movies, code, and automations.
            </p>
            <p className="text-xs sm:text-sm text-[#006aff] font-bold mt-2 tracking-wide">{XROGA_MODEL_TAGLINE}</p>
            <p className="text-[10px] sm:text-xs text-slate-600/90 mt-1.5 font-medium">{XROGA_MODEL_FIRST_LAST}</p>
          </div>

          {!loggedIn && (
            <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4 mb-10">
              <PowerSmashButton size="lg" onClick={() => router.push('/auth/signup')}>
                Get Started
              </PowerSmashButton>
              <DottedSignInButton onClick={() => router.push('/auth/login')}>Sign In</DottedSignInButton>
            </div>
          )}

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
