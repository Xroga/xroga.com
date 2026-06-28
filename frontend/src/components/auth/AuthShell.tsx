'use client';

import Link from 'next/link';
import { Logo } from '@/components/layout/Logo';
import { DESKTOP_BG, MOBILE_BG } from '@/lib/theme';
import { useThemeStore } from '@/store/useThemeStore';

const CEO_QUOTE =
  'If you can dream it, Xroga can build it — one command at a time.';

export function AuthShell({
  children,
  subtitle,
}: {
  children: React.ReactNode;
  subtitle?: string;
}) {
  const customDesktopBg = useThemeStore((s) => s.customDesktopBg);
  const customMobileBg = useThemeStore((s) => s.customMobileBg);

  return (
    <div className="xv-auth-shell min-h-screen flex flex-col lg:flex-row relative overflow-hidden">
      <div
        className="fixed inset-0 -z-10 bg-cover bg-center hidden lg:block"
        style={{ backgroundImage: `url("${customDesktopBg ?? DESKTOP_BG}")` }}
        aria-hidden
      />
      <div
        className="fixed inset-0 -z-10 bg-cover bg-center lg:hidden"
        style={{ backgroundImage: `url("${customMobileBg ?? MOBILE_BG}")` }}
        aria-hidden
      />
      <div className="fixed inset-0 -z-10 bg-gradient-to-br from-[#1a0a2e]/95 via-[#0f0f1a]/92 to-[#000]/95" aria-hidden />

      {/* CEO message — left on desktop, top on mobile */}
      <div className="xv-auth-quote-panel relative flex flex-col justify-center px-6 sm:px-10 lg:px-14 py-10 lg:py-0 lg:w-[44%] xl:w-[42%] shrink-0 min-h-[200px] lg:min-h-screen border-b lg:border-b-0 lg:border-r border-white/10">
        <div className="absolute inset-0 bg-gradient-to-br from-[#006aff]/10 via-transparent to-[#a78bfa]/10 pointer-events-none" />
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
        <p className="relative mt-8 text-xs sm:text-sm text-white/50 max-w-md leading-relaxed hidden sm:block">
          The first and last AI you will ever need. Build apps, games, movies, code, and automations — with honest action pricing.
        </p>
      </div>

      {/* Form panel */}
      <div className="flex-1 flex items-center justify-center px-4 sm:px-8 py-10 lg:py-12">
        <div className="xv-auth-form-panel w-full max-w-md">
          <div className="rounded-2xl border border-white/10 bg-black/40 backdrop-blur-xl shadow-2xl p-6 sm:p-8">
            {subtitle && (
              <p className="text-center text-xs text-[var(--muted)] mb-4">{subtitle}</p>
            )}
            {children}
          </div>
          <p className="text-center text-[10px] text-white/40 mt-4">
            <Link href="/" className="hover:text-[#93c5fd] transition-colors">← Back to homepage</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
