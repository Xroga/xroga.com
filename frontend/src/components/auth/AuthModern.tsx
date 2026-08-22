'use client';

import Link from 'next/link';

import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
} from 'react';

import { cn } from '@/lib/utils';

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
    <div className="w-full">
      <header className="mb-6">
        <h1
          className="
            text-[2rem]
            font-bold
            leading-[1.04]
            tracking-[-0.04em]
            text-[var(--auth-text)]

            sm:text-[2.35rem]
          "
        >
          {title}
        </h1>

        {subtitle ? (
          <p
            className="
              mt-2
              max-w-[520px]

              text-[14px]
              leading-[1.55]

              text-[var(--auth-muted)]
            "
          >
            {subtitle}
          </p>
        ) : null}
      </header>

      {children}
    </div>
  );
}

export function AuthModernQuote({
  text,
  author,
  compact,
}: {
  text: string;
  author: string;
  compact?: boolean;
}) {
  return (
    <blockquote
      className={cn(
        'rounded-2xl',
        'border border-[var(--auth-border)]',
        'bg-[var(--auth-soft)]',
        'px-4 py-3',
        compact
          ? 'mb-4'
          : 'mb-6'
      )}
    >
      <p
        className={cn(
          'leading-relaxed',
          'text-[var(--auth-muted)]',
          compact
            ? 'text-xs'
            : 'text-sm'
        )}
      >
        &ldquo;{text}&rdquo;
      </p>

      <footer
        className="
          mt-1.5
          text-[11px]
          font-semibold
          text-[#006aff]
        "
      >
        — {author}
      </footer>
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
        'h-[48px]',
        'w-full',

        'rounded-[14px]',

        'border',
        'border-[var(--auth-border)]',

        'bg-[var(--auth-input)]',

        'px-4',

        'text-[14px]',
        'font-medium',

        'text-[var(--auth-text)]',

        'outline-none',

        'placeholder:font-normal',
        'placeholder:text-[var(--auth-muted)]',

        'transition-all',
        'duration-200',

        'hover:border-[var(--auth-border-strong)]',

        'focus:border-[#006aff]/70',

        'focus:bg-[var(--auth-input-hover)]',

        'focus:ring-4',
        'focus:ring-[#006aff]/10',

        className
      )}
      {...props}
    />
  );
}

export function AuthModernLabel({
  children,
  htmlFor,
}: {
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="
        mb-1.5
        block

        text-[12px]
        font-semibold

        tracking-[-0.01em]

        text-[var(--auth-text)]
      "
    >
      {children}
    </label>
  );
}

type AuthGradientButtonProps =
  Omit<
    ButtonHTMLAttributes<HTMLButtonElement>,
    'children'
  > & {
    children: ReactNode;
  };

export function AuthGradientButton({
  children,
  type = 'button',
  className,
  ...props
}: AuthGradientButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'flex',
        'h-[48px]',
        'w-full',

        'items-center',
        'justify-center',

        'rounded-[14px]',

        'bg-[#006aff]',

        'px-4',

        'text-[14px]',
        'font-bold',
        'text-white',

        'shadow-[0_10px_28px_rgba(0,106,255,0.22)]',

        'transition-all',
        'duration-200',

        'hover:-translate-y-[1px]',
        'hover:bg-[#075fe1]',

        'hover:shadow-[0_14px_34px_rgba(0,106,255,0.30)]',

        'active:translate-y-0',

        'disabled:cursor-not-allowed',
        'disabled:opacity-55',

        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

type AuthSocialButtonProps =
  Omit<
    ButtonHTMLAttributes<HTMLButtonElement>,
    'type' | 'children'
  > & {
    children: ReactNode;
  };

export function AuthSocialButton({
  children,
  className,
  ...props
}: AuthSocialButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        'flex',
        'h-[48px]',
        'w-full',

        'items-center',
        'justify-center',

        'gap-2.5',

        'rounded-[14px]',

        'border',
        'border-[var(--auth-border)]',

        'bg-[var(--auth-input)]',

        'px-4',

        'text-[14px]',
        'font-semibold',

        'text-[var(--auth-text)]',

        'transition-all',
        'duration-200',

        'hover:-translate-y-[1px]',

        'hover:border-[var(--auth-border-strong)]',

        'hover:bg-[var(--auth-input-hover)]',

        'disabled:cursor-not-allowed',
        'disabled:opacity-55',

        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function AuthDivider({
  text = 'or continue with email',
}: {
  text?: string;
}) {
  return (
    <div className="relative my-4">
      <div
        className="
          absolute
          inset-0

          flex
          items-center
        "
      >
        <span
          className="
            w-full

            border-t
            border-[var(--auth-border)]
          "
        />
      </div>

      <div
        className="
          relative

          flex
          justify-center

          text-[10px]
          font-medium

          uppercase

          tracking-[0.15em]
        "
      >
        <span
          className="
            bg-[var(--auth-shell)]

            px-3

            text-[var(--auth-muted)]
          "
        >
          {text}
        </span>
      </div>
    </div>
  );
}

export function AuthStepDots({
  step,
  total = 2,
}: {
  step: number;
  total?: number;
}) {
  return (
    <div className="my-4 flex justify-center gap-2">
      {Array.from(
        {
          length:
            total,
        },
        (_, index) =>
          index + 1
      ).map(
        (item) => (
          <span
            key={item}
            className={cn(
              'h-1.5 rounded-full transition-all duration-300',

              step === item
                ? 'w-9 bg-[#006aff]'
                : 'w-4 bg-[var(--auth-soft)]'
            )}
          />
        )
      )}
    </div>
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
    <Link
      href={href}
      className="
        inline-flex
        items-center

        gap-1

        text-sm
        font-semibold

        text-[#006aff]

        transition-opacity

        hover:opacity-75
      "
    >
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
    <p
      className="
        mt-4

        text-center

        text-[13px]

        text-[var(--auth-muted)]
      "
    >
      {prompt}{' '}

      <Link
        href={href}
        className="
          font-semibold

          text-[#006aff]

          transition-opacity

          hover:opacity-75
        "
      >
        {linkText}
      </Link>
    </p>
  );
}

export function AuthBackHome() {
  return null;
}
