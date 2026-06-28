'use client';

import Link from 'next/link';
import { cn } from '@/lib/utils';
import { GradientStartButton } from '@/components/ui/Uiverse';
import type { ReactNode, InputHTMLAttributes } from 'react';

export function AuthModernCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="xv-auth-modern-card w-full">
      {subtitle && (
        <p className="xv-auth-modern-subtitle text-center text-xs font-medium mb-4">{subtitle}</p>
      )}
      <h1 className="xv-auth-gradient-title text-center text-2xl sm:text-[1.65rem] font-extrabold mb-1">
        {title}
      </h1>
      {children}
    </div>
  );
}

export function AuthModernQuote({ text, author, compact }: { text: string; author: string; compact?: boolean }) {
  return (
    <blockquote className={cn('xv-auth-modern-quote px-3 py-2 rounded-xl text-center', compact ? 'my-3' : 'my-5')}>
      <p className={cn('italic text-slate-600 leading-relaxed', compact ? 'text-xs' : 'text-sm')}>&ldquo;{text}&rdquo;</p>
      <footer className="text-[10px] mt-1 font-semibold xv-auth-gradient-text not-italic">— {author}</footer>
    </blockquote>
  );
}

export function AuthModernInput({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'xv-auth-modern-input w-full h-12 px-4 rounded-xl text-sm text-slate-800',
        'bg-white/90 border border-sky-100 shadow-[0_4px_14px_rgba(0,106,255,0.08)]',
        'placeholder:text-slate-400 focus:outline-none focus:border-[#006aff]/50 focus:ring-2 focus:ring-[#006aff]/20',
        'transition-all',
        className
      )}
      {...props}
    />
  );
}

export function AuthModernLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">{children}</p>
  );
}

export function AuthStepDots({ step, total = 2 }: { step: number; total?: number }) {
  return (
    <div className="flex justify-center gap-2 my-5">
      {Array.from({ length: total }, (_, i) => i + 1).map((s) => (
        <span
          key={s}
          className={cn(
            'h-1.5 rounded-full transition-all duration-300',
            step === s ? 'w-10 bg-gradient-to-r from-[#006aff] to-[#60a5fa]' : 'w-4 bg-slate-200'
          )}
        />
      ))}
    </div>
  );
}

export function AuthGradientButton({
  children,
  type = 'button',
  disabled,
  onClick,
  className,
}: {
  children: ReactNode;
  type?: 'button' | 'submit';
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <GradientStartButton
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={cn('xv-auth-gradient-btn w-full text-sm font-bold', className)}
    >
      {children}
    </GradientStartButton>
  );
}

export function AuthFooterLink({
  children,
  href,
}: {
  children: ReactNode;
  href: string;
}) {
  return (
    <Link href={href} className="xv-auth-footer-link inline-flex items-center gap-1 text-sm font-medium">
      {children}
    </Link>
  );
}

export function AuthSwitchText({
  prompt,
  linkText,
  href,
}: {
  prompt: string;
  linkText: string;
  href: string;
}) {
  return (
    <p className="text-center text-sm text-slate-500 mt-6">
      {prompt}{' '}
      <Link href={href} className="xv-auth-gradient-text font-semibold hover:opacity-80 transition-opacity">
        {linkText}
      </Link>
    </p>
  );
}

export function AuthBackHome() {
  return (
    <p className="text-center mt-5">
      <Link href="/" className="xv-auth-back-link text-xs font-medium inline-flex items-center gap-1.5">
        <span aria-hidden>←</span> Back to homepage
      </Link>
    </p>
  );
}
