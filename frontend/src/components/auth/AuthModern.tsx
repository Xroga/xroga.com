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
  eyebrow,
  children,
  compact = false,
}: {
  title: string;
  subtitle?: string;
  eyebrow?: ReactNode;
  children: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className="w-full">
      <header
        className={cn(
          compact
            ? 'mb-5'
            : 'mb-6'
        )}
      >
        {eyebrow ? (
          <div
            className="
              mb-2.5
              inline-flex
              items-center
              gap-2

              rounded-full

              border
              border-[var(--auth-border)]

              bg-[var(--auth-soft)]

              px-3
              py-1.5

              text-[10px]
              font-semibold

              text-[var(--auth-muted)]

              shadow-sm
            "
          >
            {eyebrow}
          </div>
        ) : null}

        <h1
          className={cn(
            'font-bold',
            'leading-[1.02]',
            'tracking-[-0.045em]',
            'text-[var(--auth-text)]',

            compact
              ? 'text-[1.75rem] xl:text-[1.65rem]'
              : 'text-[2.15rem] sm:text-[2.45rem]'
          )}
        >
          {title}
        </h1>

        {subtitle ? (
          <p
            className={cn(
              'mt-2',
              'leading-[1.55]',
              'text-[var(--auth-muted)]',

              compact
                ? 'text-[12px]'
                : 'text-[13px] sm:text-[14px]'
            )}
          >
            {subtitle}
          </p>
        ) : null}
      </header>

      {children}
    </div>
  );
}

type AuthModernInputProps =
  InputHTMLAttributes<HTMLInputElement> & {
    icon?: ReactNode;
    endAdornment?: ReactNode;
  };

export function AuthModernInput({
  className,
  icon,
  endAdornment,
  ...props
}: AuthModernInputProps) {
  return (
    <div
      className="
        group
        relative
      "
    >
      {icon ? (
        <span
          className="
            pointer-events-none
            absolute
            left-3.5
            top-1/2
            z-10

            -translate-y-1/2

            text-[var(--auth-muted)]

            transition-colors
            duration-200

            group-focus-within:text-[#006aff]
          "
        >
          {icon}
        </span>
      ) : null}

      <input
        className={cn(
          'h-[46px]',
          'w-full',

          'rounded-[14px]',

          'border',
          'border-[var(--auth-border)]',

          'bg-[var(--auth-input)]',

          icon
            ? 'pl-10'
            : 'pl-4',

          endAdornment
            ? 'pr-11'
            : 'pr-4',

          'text-[13px]',
          'font-medium',

          'text-[var(--auth-text)]',

          'outline-none',

          'placeholder:font-normal',
          'placeholder:text-[var(--auth-muted)]',

          'shadow-[inset_0_1px_0_rgba(255,255,255,0.025)]',

          'transition-all',
          'duration-200',

          'hover:border-[var(--auth-border-strong)]',

          'focus:border-[#006aff]/65',

          'focus:bg-[var(--auth-input-hover)]',

          'focus:ring-4',
          'focus:ring-[#006aff]/10',

          className
        )}
        {...props}
      />

      {endAdornment ? (
        <span
          className="
            absolute
            right-3
            top-1/2

            -translate-y-1/2
          "
        >
          {endAdornment}
        </span>
      ) : null}
    </div>
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

        text-[11px]
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
        'group',

        'flex',
        'h-[47px]',
        'w-full',

        'items-center',
        'justify-center',

        'gap-2',

        'rounded-[14px]',

        'border',
        'border-[#006aff]',

        'bg-[#006aff]',

        'px-4',

        'text-[13px]',
        'font-bold',

        'text-white',

        'shadow-[0_12px_28px_rgba(0,106,255,0.24)]',

        'transition-all',
        'duration-200',

        'hover:-translate-y-[1px]',

        'hover:bg-[#0865e6]',

        'hover:shadow-[0_16px_36px_rgba(0,106,255,0.32)]',

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

        'h-[47px]',
        'w-full',

        'items-center',
        'justify-center',

        'gap-2.5',

        'rounded-[14px]',

        'border',
        'border-[var(--auth-border)]',

        'bg-[var(--auth-input)]',

        'px-4',

        'text-[13px]',
        'font-semibold',

        'text-[var(--auth-text)]',

        'shadow-[0_5px_16px_rgba(0,0,0,0.035)]',

        'transition-all',
        'duration-200',

        'hover:-translate-y-[1px]',

        'hover:border-[var(--auth-border-strong)]',

        'hover:bg-[var(--auth-input-hover)]',

        'hover:shadow-[0_8px_22px_rgba(0,0,0,0.055)]',

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
    <div
      className="
        relative
        my-4
      "
    >
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
          font-semibold

          uppercase

          tracking-[0.15em]
        "
      >
        <span
          className="
            bg-[var(--auth-surface)]

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
