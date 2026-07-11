'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Logo } from '@/components/layout/Logo';
import { HomepageChatBar } from '@/components/terminal/HomepageChatBar';
import { HomepageTagMarquee } from '@/components/homepage/HomepageTagMarquee';
import { HomepageFooter } from '@/components/homepage/HomepageFooter';
import { HomeSignInButton, PowerSmashButton } from '@/components/ui/XrogaButtons';
import { DESKTOP_BG, MOBILE_BG } from '@/lib/theme';
import { useThemeStore } from '@/store/useThemeStore';
import { useHydrated } from '@/hooks/useHydrated';
import { createClient } from '@/lib/supabase/client';

export default function HomePage() {
  const router = useRouter();
  const hydrated = useHydrated();
  const customDesktopBg = useThemeStore((s) => s.customDesktopBg);
  const customMobileBg = useThemeStore((s) => s.customMobileBg);
  const desktopBg = hydrated ? (customDesktopBg ?? DESKTOP_BG) : DESKTOP_BG;
  const mobileBg = hydrated ? (customMobileBg ?? MOBILE_BG) : MOBILE_BG;
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    createClient()
      .auth.getSession()
      .then(({ data: { session } }) => {
        if (session) {
          router.replace('/dashboard');
          return;
        }
        setLoggedIn(false);
      });
  }, [router]);

  return (
    <div className="xv-homepage min-h-screen flex flex-col relative overflow-x-hidden bg-[#050508]">
      <div
        className="fixed inset-0 -z-10 bg-cover bg-center bg-no-repeat md:bg-fixed"
        style={{ backgroundImage: `url("${desktopBg}")` }}
        aria-hidden
      />
      <div
        className="fixed inset-0 -z-10 bg-cover bg-center bg-no-repeat md:hidden"
        style={{ backgroundImage: `url("${mobileBg}")` }}
        aria-hidden
      />
      <div className="fixed inset-0 -z-10 bg-gradient-to-b from-black/50 via-black/20 to-black/70" aria-hidden />

      <header className="xv-home-header xv-site-header sticky top-0 z-50 bg-transparent border-none shadow-none">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
          <Logo href="/" variant="homepage" height={76} className="shrink-0" />
          {!loggedIn && (
            <HomeSignInButton
              onClick={() => router.push('/auth/login')}
              className="xv-home-auth-btn !min-h-[44px] !min-w-[140px]"
            >
              Sign In
            </HomeSignInButton>
          )}
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 py-6 sm:py-10 relative">
        <div className="absolute bottom-1/4 left-1/2 -translate-x-1/2 w-[80%] max-w-lg h-40 bg-[#006aff]/15 rounded-full blur-[120px] pointer-events-none xv-ai-glow-pulse" />

        <div className="relative z-10 w-full max-w-5xl text-center">
          <h1 className="xv-hero-modern-title mb-5">
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
            <div className="flex flex-wrap items-center justify-center gap-3 mb-5 xv-home-auth-row">
              <HomeSignInButton
                onClick={() => router.push('/auth/login')}
                className="xv-home-auth-btn !min-w-[148px] !min-h-[48px]"
              >
                Sign In
              </HomeSignInButton>
              <PowerSmashButton
                size="sm"
                onClick={() => router.push('/auth/signup')}
                className="xv-get-started-outline xv-home-auth-btn !min-w-[160px] !min-h-[48px]"
              >
                Get Started
              </PowerSmashButton>
            </div>
          )}

          <div className="w-full mb-4 xv-chatbar-stack relative xv-home-chatbar-wrap">
            <HomepageChatBar />
          </div>

          <HomepageTagMarquee />
        </div>
      </main>

      <HomepageFooter />
    </div>
  );
}
