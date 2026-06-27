'use client';

import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

/** Blue 3D Power Smash — Yaseen549 style */
export function PowerSmashButton({
  children,
  onClick,
  type = 'button',
  className,
  size = 'md',
  icon,
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit';
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  icon?: ReactNode;
}) {
  const sizes = {
    sm: 'px-4 py-2 text-[10px] sm:text-xs border-b-[4px] sm:border-b-[6px] active:translate-y-[4px] sm:active:translate-y-[6px]',
    md: 'px-6 sm:px-8 py-2.5 sm:py-3.5 text-xs sm:text-sm border-b-[6px] sm:border-b-[8px] active:translate-y-[6px] sm:active:translate-y-[8px]',
    lg: 'px-8 py-4 text-sm sm:text-base border-b-[8px] active:translate-y-[8px]',
  };

  return (
    <button
      type={type}
      onClick={onClick}
      className={cn(
        'xv-power-smash group relative font-bold text-white uppercase tracking-wider rounded-2xl',
        'bg-[#006aff] border-[#0047b3] active:border-b-0',
        'transition-all duration-100 shadow-[0_15px_25px_-10px_rgba(0,106,255,0.75)]',
        'focus:outline-none focus:ring-4 focus:ring-blue-400/50',
        sizes[size],
        className
      )}
    >
      <span className="absolute inset-0 w-full h-full rounded-2xl bg-gradient-to-t from-black/20 to-transparent pointer-events-none" />
      <span className="absolute top-1.5 sm:top-2 left-2 sm:left-3 w-5 sm:w-6 h-2.5 sm:h-3 rounded-full bg-white/40 blur-[2px] pointer-events-none" />
      <span className="relative flex items-center justify-center gap-2 drop-shadow-md">
        {icon ?? (
          <svg className="w-4 h-4 sm:w-5 sm:h-5 animate-pulse shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        )}
        {children}
      </span>
    </button>
  );
}

/** Black dotted Sign In — augustin_4687 style, adapted blue shadow */
export function DottedSignInButton({
  children,
  onClick,
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button type="button" onClick={onClick} className={cn('xv-dotted-signin', className)}>
      <div>
        <span>{children}</span>
      </div>
    </button>
  );
}
