'use client';

import { useEffect, useState } from 'react';
import { HomepageChatBar } from '@/components/terminal/HomepageChatBar';
import { HomepageTagMarquee } from '@/components/homepage/HomepageTagMarquee';
import { HomepageFooter } from '@/components/homepage/HomepageFooter';
import { HomepageFloatingHeader } from '@/components/homepage/HomepageFloatingHeader';
import { DESKTOP_BG, MOBILE_BG } from '@/lib/theme';
import { useThemeStore } from '@/store/useThemeStore';
import { useHydrated } from '@/hooks/useHydrated';
import { createClient } from '@/lib/supabase/client';

export default function HomePage() {
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
        setLoggedIn(!!session);
      });
  }, []);

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

      <HomepageFloatingHeader loggedIn={loggedIn} />

      <main className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 py-4 sm:py-8 relative">
        <div className="relative z-10 w-full max-w-5xl text-center">
          <h1 className="xv-hero-modern-title mb-6 sm:mb-8">
            <span className="xv-hero-modern-line block">
              <span className="xv-hero-silver">Do </span>
              <span className="xv-hero-silver-italic">Everything</span>
            </span>
            <span className="xv-hero-modern-line block mt-1 sm:mt-2">
              <span className="xv-hero-blue">You </span>
              <span className="xv-hero-blue-italic">Imagine</span>
            </span>
          </h1>

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
