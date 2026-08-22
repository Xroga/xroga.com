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
      <header className="mb-4">
        <h1
          className="
            text-[1.85rem]
            font-bold
            leading-[1.05]
            tracking-[-0.035em]
            text-[var(--auth-text)]

            sm:text-[2.1rem]
          "
        >
          {title}
        </h1>

        {subtitle ? (
          <p
            className="
              mt-1.5
              max-w-md
              text-[13px]
              leading-relaxed
              text-[var(--auth-muted)]

              sm:text-sm
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
        'rounded-xl',
        'border border-[var(--auth-border)]',
        'bg-[var(--auth-soft)]',
        'px-3.5 py-2.5',
        compact
          ? 'mb-3'
          : 'mb-5'
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
          mt-1
          text-[10px]
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
        'h-10.5 w-full',
        'rounded-xl',
        'border border-[var(--auth-border)]',
        'bg-[var(--auth-input)]',
        'px-3.5',
        'text-sm',
        'text-[var(--auth-text)]',
        'outline-none',
        'placeholder:text-[var(--auth-muted)]',
        'transition-all duration-200',

        'hover:border-[var(--auth-border-strong)]',

        'focus:border-[#006aff]',
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
        mb-1
        block
        text-[11px]
        font-semibold
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
        'relative',
        'flex h-10.5 w-full',
        'items-center justify-center',
        'overflow-hidden',
        'rounded-xl',

        'bg-[#006aff]',
        'px-4',

        'text-sm',
        'font-bold',
        'text-white',

        'shadow-[0_8px_24px_rgba(0,106,255,0.22)]',

        'transition-all duration-200',

        'hover:-translate-y-[1px]',
        'hover:bg-[#075fe1]',
        'hover:shadow-[0_11px_30px_rgba(0,106,255,0.30)]',

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
        'flex h-10.5 w-full',
        'items-center justify-center',
        'gap-2.5',

        'rounded-xl',

        'border',
        'border-[var(--auth-border)]',

        'bg-[var(--auth-input)]',

        'px-4',

        'text-sm',
        'font-semibold',
        'text-[var(--auth-text)]',

        'transition-all duration-200',

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
    <div className="relative my-3">
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
          text-[9px]
          uppercase
          tracking-[0.13em]
        "
      >
        <span
          className="
            bg-[var(--auth-panel)]
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
        mt-3
        text-center
        text-[12px]
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
