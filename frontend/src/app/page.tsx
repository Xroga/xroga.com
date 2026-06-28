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
      <div className="fixed inset-0 -z-10 bg-gradient-to-b from-black/50 via-black/20 to-black/55" aria-hidden />

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
        <div className="absolute bottom-1/4 left-1/2 -translate-x-1/2 w-[80%] max-w-lg h-40 bg-[#006aff]/15 rounded-full blur-[120px] pointer-events-none" />

        <div className="relative z-10 w-full max-w-5xl text-center">
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

          <AppStoreInline className="mb-5 justify-center" />
          <HomepageTagMarquee />
        </div>
      </main>

      <footer className="relative z-10 py-4 px-4 xv-home-footer-scroll">
        <div className="flex items-center gap-2 sm:gap-3 overflow-x-auto scrollbar-hide max-w-full mx-auto pb-1">
          <Link href="/features" className="xv-footer-pill shrink-0">Features</Link>
          <Link href="/auth/signup" className="xv-footer-pill shrink-0">Sign Up</Link>
          <Link href="/auth/login" className="xv-footer-pill shrink-0">Sign In</Link>
          <Link href="/about" className="xv-footer-pill shrink-0">About Xroga</Link>
          <Link href="/docs/api" className="xv-footer-pill shrink-0">API</Link>
          <Link href="/pricing" className="xv-footer-pill shrink-0">Pricing</Link>
          <Link href="/privacy" className="xv-footer-pill shrink-0">Privacy Policy</Link>
          <Link href="/terms" className="xv-footer-pill shrink-0">Terms of Service</Link>
          <Link href="/refund" className="xv-footer-pill shrink-0">Refund Policy</Link>
        </div>
      </footer>
    </div>
  );
}
