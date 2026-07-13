'use client';

import Link from 'next/link';
import { Logo } from '@/components/layout/Logo';
import { MOBILE_BG } from '@/lib/theme';
import { useThemeStore } from '@/store/useThemeStore';
import { AuthBackHome } from './AuthModern';

const CEO_QUOTE =
  'If you can dream it, Xroga can build it — one command at a time.';

export function AuthShell({
  children,
}: {
  children: React.ReactNode;
  subtitle?: string;
}) {
  const customMobileBg = useThemeStore((s) => s.customMobileBg);
  const customDesktopBg = useThemeStore((s) => s.customDesktopBg);

  return (
    <div className="xv-auth-shell min-h-screen flex flex-col lg:flex-row relative overflow-hidden">
      {customDesktopBg ? (
        <div
          className="fixed inset-0 -z-10 bg-cover bg-center bg-no-repeat md:bg-fixed hidden md:block"
          style={{ backgroundImage: `url("${customDesktopBg}")` }}
          aria-hidden
        />
      ) : null}
      <div
        className="fixed inset-0 -z-10 bg-cover bg-center bg-no-repeat md:hidden"
        style={{ backgroundImage: `url("${customMobileBg ?? MOBILE_BG}")` }}
        aria-hidden
      />
      {!customDesktopBg ? null : (
        <div className="fixed inset-0 -z-10 bg-gradient-to-b from-black/50 via-black/30 to-black/60 hidden md:block" aria-hidden />
      )}

      <div className="xv-auth-quote-panel relative flex flex-col justify-center px-6 sm:px-10 lg:px-14 py-10 lg:py-0 lg:w-[44%] xl:w-[42%] shrink-0 min-h-[220px] lg:min-h-screen border-b lg:border-b-0 lg:border-r border-white/10">
        <div className="absolute inset-0 bg-gradient-to-br from-[#006aff]/15 via-transparent to-[#a78bfa]/10 pointer-events-none" />
        <Link href="/" className="relative mb-8 lg:mb-12 inline-block">
          <Logo variant="homepage" height={48} />
        </Link>
        <blockquote className="relative xv-auth-ceo-quote">
          <p className="text-2xl sm:text-3xl lg:text-4xl xl:text-[2.75rem] font-bold leading-[1.15] tracking-tight text-[#e8c4a8]">
            &ldquo;{CEO_QUOTE}&rdquo;
          </p>
          <footer className="mt-6 text-sm sm:text-base font-bold tracking-[0.2em] text-[#93c5fd]/90">
            — XROGA
          </footer>
        </blockquote>
        <p className="relative mt-8 text-xs sm:text-sm text-white/55 max-w-md leading-relaxed hidden sm:block">
          The first and last AI you will ever need. Build apps, games, movies, code, and automations — with honest action pricing.
        </p>
      </div>

      <div className="flex-1 flex items-center justify-center px-4 sm:px-8 py-10 lg:py-12">
        <div className="xv-auth-form-panel w-full max-w-[420px]">
          <div className="xv-auth-glass-card rounded-3xl p-6 sm:p-8 shadow-2xl">
            {children}
          </div>
          <AuthBackHome />
        </div>
      </div>
    </div>
  );
}
