'use client';

import { useRouter } from 'next/navigation';
import { Logo } from '@/components/layout/Logo';
import { HomepageChatBar } from '@/components/terminal/HomepageChatBar';
import { Sparkles } from 'lucide-react';
import { StaticQuickTab, GradientStartButton, PlayNowButton } from '@/components/ui/Uiverse';
import { DESKTOP_BG, MOBILE_BG } from '@/lib/theme';
import { useThemeStore } from '@/store/useThemeStore';
import Link from 'next/link';

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

  return (
    <div className="min-h-screen flex flex-col relative overflow-x-hidden">
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
      <div className="fixed inset-0 -z-10 bg-gradient-to-b from-black/40 via-black/25 to-black/50" aria-hidden />

      <header className="xv-home-header sticky top-0 z-50 bg-black/30 backdrop-blur-xl border-b border-white/10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-2 min-w-0">
          <Logo href="/" variant="homepage" height={44} className="shrink-0 min-w-0 max-w-[42%] sm:max-w-none" />
          <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
            <PlayNowButton className="xv-play-btn-sm" onClick={() => router.push('/auth/login')}>
              Sign In
            </PlayNowButton>
            <GradientStartButton className="xv-gradient-btn-sm" onClick={() => router.push('/auth/signup')}>
              <span className="hidden min-[380px]:inline">Get Started</span>
              <span className="min-[380px]:hidden">Start</span>
            </GradientStartButton>
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 py-8 sm:py-14 relative w-full max-w-[100vw]">
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-full max-w-3xl h-48 sm:h-64 bg-gradient-to-t from-[var(--primary)]/25 via-[var(--primary)]/8 to-transparent rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 w-full max-w-3xl text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full glass-panel text-[10px] sm:text-xs text-[var(--accent)] mb-4 sm:mb-6 font-terminal tracking-wider">
            <Sparkles className="w-3 h-3 shrink-0" />
            NEXT-GEN AGI • LIVE NOW
          </div>

          <h1 className="text-[2rem] leading-[1.1] sm:text-5xl md:text-6xl lg:text-7xl font-bold mb-3 sm:mb-4 text-balance">
            <span className="text-white drop-shadow-lg">Do Everything</span>
            <br />
            <span className="gradient-text-blue">You Imagine</span>
          </h1>

          <p className="text-white/85 max-w-lg mx-auto mb-6 sm:mb-10 text-sm sm:text-base drop-shadow px-1">
            XROGA AI — build, automate, and create with a multi-agent swarm. Websites, apps, games, and browser research in one place.
          </p>

          <HomepageChatBar />

          <div className="flex flex-wrap justify-center gap-1.5 sm:gap-2 max-w-3xl mx-auto mt-6 sm:mt-8 px-1">
            {HOMEPAGE_TAGS.map((tag) => (
              <StaticQuickTab key={tag} onClick={() => router.push('/auth/signup')}>
                {tag}
              </StaticQuickTab>
            ))}
          </div>
        </div>
      </main>

      <footer className="relative z-10 py-5 text-center text-xs text-white/60">
        <Link href="/about" className="text-[var(--accent)] hover:underline">
          About Xroga
        </Link>
        <span className="mx-2">·</span>
        <Link href="/pricing" className="text-[var(--accent)] hover:underline">
          Pricing
        </Link>
      </footer>
    </div>
  );
}
