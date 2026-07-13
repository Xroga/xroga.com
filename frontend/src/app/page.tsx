'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Logo } from '@/components/layout/Logo';
import { HomepageChatBar } from '@/components/terminal/HomepageChatBar';
import { HomepageTagMarquee } from '@/components/homepage/HomepageTagMarquee';
import { HomeSignInButton, PowerSmashButton } from '@/components/ui/XrogaButtons';
import { MOBILE_BG } from '@/lib/theme';
import { useThemeStore } from '@/store/useThemeStore';
import { useHydrated } from '@/hooks/useHydrated';
import { createClient } from '@/lib/supabase/client';

const FOOTER_LINKS = [
  { href: '/features', label: 'Features' },
  { href: '/auth/signup', label: 'Sign Up' },
  { href: '/about', label: 'About Xroga' },
  { href: '/docs/api', label: 'API' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/privacy', label: 'Privacy' },
  { href: '/terms', label: 'Terms' },
  { href: '/refund', label: 'Refund' },
];

export default function HomePage() {
  const router = useRouter();
  const hydrated = useHydrated();
  const customMobileBg = useThemeStore((s) => s.customMobileBg);
  const mobileBg = hydrated ? (customMobileBg ?? MOBILE_BG) : MOBILE_BG;
  const [loggedIn, setLoggedIn] = useState(false);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    createClient()
      .auth.getSession()
      .then(({ data: { session } }) => {
        setLoggedIn(!!session);
        setAuthReady(true);
      });
  }, []);

  return (
    <div className="xv-homepage min-h-screen flex flex-col relative overflow-x-hidden">
      <div
        className="fixed inset-0 -z-10 bg-cover bg-center bg-no-repeat md:hidden"
        style={{ backgroundImage: `url("${mobileBg}")` }}
        aria-hidden
      />

      <header className="xv-home-header xv-site-header sticky top-0 z-50 bg-transparent border-none shadow-none">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
          <Logo href="/" variant="homepage" height={76} className="shrink-0" />
          {authReady && loggedIn && (
            <PowerSmashButton
              size="sm"
              onClick={() => router.push('/workspace')}
              className="xv-get-started-outline xv-home-auth-btn !min-w-[140px] !min-h-[44px]"
            >
              Dashboard
            </PowerSmashButton>
          )}
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 py-6 sm:py-10 relative">
        <div className="absolute bottom-1/4 left-1/2 -translate-x-1/2 w-[80%] max-w-lg h-40 bg-[#006aff]/15 rounded-full blur-[120px] pointer-events-none xv-ai-glow-pulse" />

        <div className="relative z-10 w-full max-w-5xl text-center">
          <h1 className="xv-hero-modern-title mb-5 font-goga">
            <span className="xv-hero-modern-line block">
              <span className="xv-hero-silver font-azurio">Do </span>
              <span className="xv-hero-silver-italic font-emilio">Everything</span>
            </span>
            <span className="xv-hero-modern-line block mt-1 sm:mt-2">
              <span className="xv-hero-blue font-azurio">You </span>
              <span className="xv-hero-blue-italic font-emilio">Imagine</span>
            </span>
          </h1>

          {authReady && !loggedIn && (
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

      <footer className="relative z-10 py-6 px-4 xv-home-footer-modern">
        <div className="max-w-3xl mx-auto">
          <div className="xv-home-footer-glass rounded-2xl px-4 py-4 sm:px-6 sm:py-5">
            <nav className="flex flex-wrap items-center justify-center gap-x-1 gap-y-2">
              {FOOTER_LINKS.map(({ href, label }, i) => (
                <span key={href} className="inline-flex items-center">
                  <Link href={href} className="xv-home-footer-link">
                    {label}
                  </Link>
                  {i < FOOTER_LINKS.length - 1 && (
                    <span className="text-white/20 mx-2 hidden sm:inline select-none">·</span>
                  )}
                </span>
              ))}
            </nav>
            <p className="text-[10px] text-center text-white/35 mt-3 font-medium tracking-wide">
              XROGA AI · Black Hole V∞ · Ship something legendary
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
